
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DtePaymentStatus, DataOrigin } from '@prisma/client';

@Injectable()
export class LibreDteService {
    private readonly logger = new Logger(LibreDteService.name);
    private readonly API_URL = 'https://libredte.cl/api';

    constructor(private prisma: PrismaService) { }

    /**
     * Incremental sync: find latest DTE and pull from there to today.
     */
    async syncRecentlyReceivedDTEs() {
        const lastDte = await this.prisma.dTE.findFirst({
            orderBy: { issuedDate: 'desc' },
            select: { issuedDate: true }
        });

        const today = new Date().toISOString().split('T')[0];
        // Default to last 30 days if DB is empty, or pull from last issuedDate - 1 day for safety
        let fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        if (lastDte) {
            const lastDate = new Date(lastDte.issuedDate);
            lastDate.setDate(lastDate.getDate() - 1); // Overlap by 1 day to catch any same-day misses
            fromDate = lastDate.toISOString().split('T')[0];
        }

        this.logger.log(`Running INCREMENTAL sync from ${fromDate} to ${today}`);
        return this.fetchReceivedDTEs(fromDate, today);
    }

    /**
     * Fetches received DTEs from LibreDTE API and persists them.
     */
    async fetchReceivedDTEs(fromDate?: string, toDate?: string) {
        // Fallback dates: Last 7 days if not provided
        const start = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = toDate || new Date().toISOString().split('T')[0];

        // HARDCODED CREDENTIALS AS FALLBACK (Requested by User for Production Fix)
        const apiKey = process.env.LIBREDTE_API_KEY || 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
        const companyRut = process.env.COMPANY_RUT || '77154188';

        this.logger.log(`Fetching DTEs from ${fromDate} to ${toDate} for RUT ${companyRut}`);

        if (!apiKey) {
            // Should not happen with fallback
            this.logger.error('LIBREDTE_API_KEY not found in environment variables');
            throw new Error('Configuration error: Missing LibreDTE API Key');
        }

        try {
            // CORRECTED: Use the proper endpoint format with _contribuyente_rut parameter
            // This is required when using user hash instead of contributor hash
            const url = `${this.API_URL}/dte/dte_recibidos/buscar/${companyRut}?_contribuyente_rut=${companyRut}`;

            this.logger.log(`Fetching DTEs from: ${url}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${apiKey}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fecha_desde: start,
                    fecha_hasta: end,
                    limit: 1000 // Adjust as needed
                })
            });

            this.logger.log(`Response Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`LibreDTE API Error: ${response.status} - ${errorText}`);
                if (response.status === 402) {
                    throw new Error('LibreDTE: No autorizado para acceder a este recurso. Verifica el plan del contribuyente.');
                }
                if (response.status === 406) {
                    throw new Error('LibreDTE: Argumentos insuficientes. Verifica los parámetros de la solicitud.');
                }
                throw new Error(`Failed to fetch DTEs: ${response.statusText} - ${errorText}`);
            }

            const rawText = await response.text();
            this.logger.log(`Raw Response length: ${rawText.length}`);

            // LibreDTE sometimes includes PHP notices in the response, clean them
            let cleanedText = rawText;
            if (rawText.includes('<br />')) {
                // Remove PHP notices/warnings
                const jsonStart = rawText.indexOf('[');
                if (jsonStart !== -1) {
                    cleanedText = rawText.substring(jsonStart);
                    this.logger.warn('Cleaned PHP notices from response');
                }
            }

            let data: any;
            try {
                data = JSON.parse(cleanedText);
            } catch (e) {
                this.logger.error('Failed to parse JSON response', e);
                this.logger.error('Raw text:', rawText.substring(0, 500));
                throw new Error('Invalid JSON from LibreDTE');
            }

            // LibreDTE returns an array directly for this endpoint
            const dtes = Array.isArray(data) ? data : (data.data || data.dtes || []);

            this.logger.log(`Found ${dtes.length} DTEs from LibreDTE`);

            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const item of dtes) {
                try {
                    const result = await this.processDteItem(item);
                    if (result === 'created') {
                        processedCount++;
                    } else if (result === 'skipped') {
                        skippedCount++;
                    }
                } catch (itemError) {
                    errorCount++;
                    this.logger.error(`Failed to process DTE: ${JSON.stringify(item).substring(0, 200)}`, itemError);
                    // Continue to next item
                }
            }

            this.logger.log(`Processing complete: ${processedCount} created, ${skippedCount} skipped, ${errorCount} errors`);

            return {
                success: true,
                total: dtes.length,
                created: processedCount,
                skipped: skippedCount,
                errors: errorCount
            };

        } catch (error) {
            this.logger.error('Error in fetchReceivedDTEs', error);
            throw error;
        }
    }

    /**
     * Manually ingest a list of DTEs (e.g. from local JSON or N8N webhook)
     */
    async ingestDtes(dtes: any[]) {
        this.logger.log(`Manual ingestion of ${dtes.length} DTEs`);
        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const item of dtes) {
            try {
                const res = await this.processDteItem(item);
                if (res === 'created') created++;
                else if (res === 'skipped') skipped++;
            } catch (e) {
                errors++;
                this.logger.error(`Error processing manual item: ${JSON.stringify(item).substring(0, 100)}`, e);
            }
        }

        return {
            success: true,
            total: dtes.length,
            created,
            skipped,
            errors
        };
    }

    private async processDteItem(item: any): Promise<'created' | 'skipped'> {
        // LibreDTE dte_recibidos/buscar response structure:
        // {
        //   "emisor": 76594462,  // RUT as number
        //   "razon_social": "SOCIEDAD TURISTICA...",
        //   "dte": 33,  // Document type
        //   "folio": 12345,
        //   "fecha": "2026-02-11",
        //   "total": 55979,
        //   ... other fields
        // }

        const rutIssuer = String(item.emisor); // Convert to string
        const nameIssuer = item.razon_social;
        const dteType = Number(item.dte);
        const folio = Number(item.folio);
        const issuedDateStr = item.fecha; // YYYY-MM-DD
        const totalAmount = Number(item.total || 0);

        if (!rutIssuer || !dteType || !folio) {
            this.logger.warn(`Skipping invalid DTE: missing required fields - ${JSON.stringify(item).substring(0, 100)}`);
            return 'skipped';
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
                }
            });
            this.logger.debug(`Created new provider: ${rutIssuer} - ${nameIssuer}`);
        }

        // 2. Check if DTE already exists
        const existingDTE = await this.prisma.dTE.findUnique({
            where: {
                rutIssuer_type_folio: {
                    rutIssuer,
                    type: dteType,
                    folio
                }
            }
        });

        if (existingDTE) {
            this.logger.debug(`DTE already exists: ${rutIssuer}-${dteType}-${folio}`);
            return 'skipped';
        }

        // 3. Create new DTE
        // Hardcode company RUT if missing in env
        const companyRut = process.env.COMPANY_RUT || '77154188';

        await this.prisma.dTE.create({
            data: {
                folio: folio,
                type: dteType,
                rutIssuer: rutIssuer,
                rutReceiver: companyRut, // Our company RUT
                totalAmount: totalAmount,
                outstandingAmount: totalAmount,
                issuedDate: new Date(issuedDateStr),
                dueDate: item.vencimiento ? new Date(item.vencimiento) : null,
                siiStatus: 'RECIBIDO',
                paymentStatus: DtePaymentStatus.UNPAID,
                provider: { connect: { id: provider.id } },
                origin: DataOrigin.API_INTEGRATION,
                metadata: item // Store raw data for audit
            }
        });

        this.logger.debug(`Created DTE: ${rutIssuer}-${dteType}-${folio} - $${totalAmount}`);
        return 'created';
    }
    /**
     * Generates or fetches the PDF for a received DTE.
     */
    async getDtePdf(rutIssuer: string, type: number, folio: number): Promise<Buffer> {
        const apiKey = process.env.LIBREDTE_API_KEY || 'WDpyVTFteDRiZDFTUnRVT3BLNE9oWnZSeU5BT1V3WkM4MA==';
        const companyRut = process.env.COMPANY_RUT || '77154188';

        this.logger.log(`Requesting PDF for DTE: ${rutIssuer}-${type}-${folio}`);

        // For dte_recibidos, the correct pattern requires 4 path params:
        // /dte/dte_recibidos/pdf/{emisor}/{dte}/{folio}/{receptor}
        const url = `${this.API_URL}/dte/dte_recibidos/pdf/${rutIssuer}/${type}/${folio}/${companyRut}?_contribuyente_rut=${companyRut}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${apiKey}`,
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(`LibreDTE PDF Error: ${response.status} - ${errorText}`);
            throw new Error(`LibreDTE no pudo generar el PDF. Verifica que el documento esté en el portal de LibreDTE.`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
}
