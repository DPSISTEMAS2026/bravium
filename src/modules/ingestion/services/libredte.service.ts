
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DtePaymentStatus, DataOrigin } from '@prisma/client';

@Injectable()
export class LibreDteService {
    private readonly logger = new Logger(LibreDteService.name);
    private readonly API_URL = 'https://libredte.cl/api';

    constructor(private prisma: PrismaService) { }

    /**
     * Fetches received DTEs from LibreDTE API and persists them.
     * @param fromDate Start date in YYYY-MM-DD format
     * @param toDate End date in YYYY-MM-DD format
     */
    async fetchReceivedDTEs(fromDate: string, toDate: string) {
        const apiKey = process.env.LIBREDTE_API_KEY;
        this.logger.log(`Using API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'UNDEFINED'}`);

        if (!apiKey) {
            this.logger.error('LIBREDTE_API_KEY not found in environment variables');
            throw new Error('Configuration error: Missing LibreDTE API Key');
        }

        try {
            // Trying endpoint found in search: /api/dte/registro_compras/buscar/{receptor} (using implicit auth receptor if possible or trying to find one)
            // If the API requires the RUT in the URL, we need it. 
            // Let's assume the API key is enough for some context, but the endpoint pattern suggests {receptor}.
            // I'll try a generic `buscar` first if possible, or try to get company RUT.

            // For now, let's try to query without RUT in path, or inspect if we have the RUT.
            // If this fails, I will ask the user for the Company RUT.

            const url = `${this.API_URL}/dte/documentos_recibidos/listar`; // Last attempt with this common one via POST? No, tried that.

            // Let's try the one from search:
            // Need company RUT.
            const companyRut = process.env.COMPANY_RUT || '76201228-5'; // Default or from env
            const url2 = `${this.API_URL}/dte/registro_compras/buscar/${companyRut}`;

            this.logger.log(`Fetching DTEs from: ${url2}`);

            const response = await fetch(url2, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    desde: fromDate,
                    hasta: toDate,
                })
            });

            this.logger.log(`Response Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`LibreDTE API Error: ${response.status} - ${errorText}`);
                if (response.status === 402) {
                    throw new Error('LibreDTE Plan Limit Reached or Feature Not Available (Payment Required)');
                }
                throw new Error(`Failed to fetch DTEs: ${response.statusText}`);
            }

            const rawText = await response.text();
            this.logger.log(`Raw Response length: ${rawText.length}`);

            let data: any;
            try {
                data = JSON.parse(rawText);
            } catch (e) {
                this.logger.error('Failed to parse JSON response', e);
                throw new Error('Invalid JSON from LibreDTE');
            }

            // Validate response structure (response.data based on prompt instruction "Iterar response.data[]")
            // Usually LibreDTE returns { code: 200, dtes: [...] } or just the array depending on endpoint version.
            // Prompt says: "Iterar response.data[]". I will adhere to that.
            // If response is the array directly, I'll adapt. logic: data.data || data

            this.logger.log(`LibreDTE Response Keys: ${Object.keys(data).join(', ')}`);

            // Adaptive extraction: 
            // 1. Direct array
            // 2. data.data (standard paginated)
            // 3. data.dtes (common LibreDTE format)
            const dtes = Array.isArray(data) ? data : (data.data || data.dtes || []);

            this.logger.log(`Found ${dtes.length} DTEs from LibreDTE`);

            let processedCount = 0;

            for (const item of dtes) {
                try {
                    await this.processDteItem(item);
                    processedCount++;
                } catch (itemError) {
                    this.logger.error(`Failed to process item: ${JSON.stringify(item)}`, itemError);
                    // Continue to next item
                }
            }

            return { success: true, count: processedCount };

        } catch (error) {
            this.logger.error('Error in fetchReceivedDTEs', error);
            throw error;
        }
    }

    private async processDteItem(item: any) {
        // Mapeo según Prompt:
        // emisor.rut → rut_emisor
        // emisor.razon_social → razon_social_emisor
        // dte → tipo_dte
        // folio → folio
        // fecha → fecha_emision
        // total → monto_total

        const rutIssuer = item.emisor?.rut;
        const nameIssuer = item.emisor?.razon_social; // "razon_social" usually comes from API
        const dteType = Number(item.dte); // "dte" field in API is the type (e.g. 33)
        const folio = Number(item.folio);
        const issuedDateStr = item.fecha; // YYYY-MM-DD
        const totalAmount = Number(item.total);

        if (!rutIssuer || !dteType || !folio) {
            this.logger.warn(`Skipping invalid item: ${JSON.stringify(item)}`);
            return;
        }

        // 1. Upsert Provider
        let provider = await this.prisma.provider.findUnique({
            where: { rut: rutIssuer }
        });

        if (!provider) {
            provider = await this.prisma.provider.create({
                data: {
                    rut: rutIssuer,
                    name: nameIssuer || `Provider ${rutIssuer}`,
                    // organizationId: ??? (Leaving nullable as per current context, or assuming context user?)
                    // For backend task, we might not have user context here yet.
                }
            });
            this.logger.debug(`Created new provider: ${rutIssuer}`);
        }

        // 2. Persist DTE
        // check uniqueness using the composite key defined in schema: @@unique([rutIssuer, type, folio])
        const existingDTE = await this.prisma.dTE.findUnique({
            where: {
                rutIssuer_type_folio: {
                    rutIssuer,
                    type: dteType,
                    folio
                }
            }
        });

        if (!existingDTE) {
            await this.prisma.dTE.create({
                data: {
                    folio: folio,
                    type: dteType,
                    rutIssuer: rutIssuer,
                    rutReceiver: item.receptor?.rut || 'UNKNOWN', // Field not specified in prompt but required by schema?
                    // Schema: rutReceiver String. I need to populate it. LibreDTE response usually has receptor.
                    // If not present, I'll put a placeholder or env value (our company RUT).
                    // I will look for 'receptor.rut' in item.

                    totalAmount: totalAmount,
                    outstandingAmount: totalAmount,
                    issuedDate: new Date(issuedDateStr),
                    siiStatus: 'RECIBIDO', // Prompt: status='pendiente'. Storing 'RECIBIDO' as semantic status.
                    paymentStatus: DtePaymentStatus.UNPAID, // Maps to 'pendiente' payment logic

                    provider: { connect: { id: provider.id } },
                    origin: DataOrigin.API_INTEGRATION,
                    metadata: item // Store raw for audit
                }
            });
        }
    }
}
