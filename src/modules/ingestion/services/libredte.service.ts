
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
    async syncRecentlyReceivedDTEs(organizationId: string) {
        const lastDte = await this.prisma.dTE.findFirst({
            where: {
                provider: { organizationId }
            },
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

        this.logger.log(`Running INCREMENTAL sync from ${fromDate} to ${today} for Org: ${organizationId}`);
        return this.fetchReceivedDTEs(fromDate, today, organizationId);
    }

    /**
     * Fetches received DTEs from LibreDTE API and persists them.
     */
    async fetchReceivedDTEs(fromDate?: string, toDate?: string, organizationId?: string) {
        if (!organizationId) throw new Error('organizationId is required');

        const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org || !org.libreDteApiKey || !org.libreDteRut) {
            throw new Error(`Organization missing LibreDTE credentials (orgId: ${organizationId})`);
        }

        // Fallback dates: Last 7 days if not provided
        const start = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const end = toDate || new Date().toISOString().split('T')[0];

        const apiKey = org.libreDteApiKey;
        const companyRut = org.libreDteRut;

        this.logger.log(`Fetching DTEs from ${start} to ${end} for RUT ${companyRut}`);

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

            let data: any;
            try {
                let cleaned = rawText.trim();
                const firstBracket = Math.min(
                    cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
                    cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
                );
                if (firstBracket < cleaned.length) {
                    cleaned = cleaned.substring(firstBracket);
                }
                const lastBracket = Math.max(
                    cleaned.lastIndexOf(']'),
                    cleaned.lastIndexOf('}')
                );
                if (lastBracket !== -1) {
                    cleaned = cleaned.substring(0, lastBracket + 1);
                }
                data = JSON.parse(cleaned);
            } catch (e) {
                this.logger.error('Failed to parse JSON response', e);
                this.logger.error('Raw text sample:', rawText.substring(0, 500));
                throw new Error('Invalid JSON from LibreDTE: ' + e.message);
            }

            // LibreDTE returns an array directly for this endpoint
            const dtes = Array.isArray(data) ? data : (data.data || data.dtes || []);

            this.logger.log(`Found ${dtes.length} DTEs from LibreDTE`);

            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const item of dtes) {
                try {
                    const result = await this.processDteItem(item, organizationId, companyRut);
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
    async ingestDtes(dtes: any[], organizationId: string) {
        this.logger.log(`Manual ingestion of ${dtes.length} DTEs for org ${organizationId}`);

        const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org || !org.libreDteRut) throw new Error('Organization not found or missing RUT');
        
        let created = 0;
        let skipped = 0;
        let errors = 0;

        for (const item of dtes) {
            try {
                const res = await this.processDteItem(item, organizationId, org.libreDteRut);
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

    private async processDteItem(item: any, organizationId: string, companyRut: string): Promise<'created' | 'skipped'> {
        const rutIssuer = String(item.emisor);
        const nameIssuer = item.razon_social;
        const dteType = Number(item.dte);
        const folio = Number(item.folio);
        const issuedDateStr = item.fecha; // YYYY-MM-DD
        const totalAmount = Number(item.total || 0);

        if (!rutIssuer || !dteType || !folio) {
            this.logger.warn(`Skipping invalid DTE: missing required fields - ${JSON.stringify(item).substring(0, 100)}`);
            return 'skipped';
        }

        // 1. Upsert Provider (Scoped by Org)
        let provider = await this.prisma.provider.findFirst({
            where: { rut: rutIssuer, organizationId }
        });

        if (!provider) {
            provider = await this.prisma.provider.create({
                data: {
                    rut: rutIssuer,
                    name: nameIssuer || `Provider ${rutIssuer}`,
                    organizationId
                }
            });
            this.logger.debug(`Created new provider: ${rutIssuer}`);
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

        // 2.a Check if exists AND belongs to THIS org
        if (existingDTE) {
            if (existingDTE.providerId === provider.id) {
                this.logger.debug(`DTE already exists: ${rutIssuer}-${dteType}-${folio}`);
                return 'skipped';
            }
        }

        // Notas de Crédito (61) son abonos: no generan deuda pendiente
        const isNotaCredito = dteType === 61;
        const isNotaDebito = dteType === 56;
        const isAbono = isNotaCredito; // NC = abono a favor

        // 3. Create new DTE
        await this.prisma.dTE.create({
            data: {
                folio: folio,
                type: dteType,
                rutIssuer: rutIssuer,
                rutReceiver: companyRut, // Org RUT
                totalAmount: totalAmount,
                outstandingAmount: isAbono ? 0 : totalAmount,
                issuedDate: new Date(issuedDateStr),
                dueDate: item.vencimiento ? new Date(item.vencimiento) : null,
                siiStatus: 'RECIBIDO',
                paymentStatus: isAbono ? DtePaymentStatus.PAID : DtePaymentStatus.UNPAID,
                providerId: provider.id,
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
    async getDtePdf(rutIssuer: string, type: number, folio: number, organizationId: string): Promise<Buffer> {
        const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org || !org.libreDteApiKey || !org.libreDteRut) {
            throw new Error('Organization missing LibreDTE credentials for PDF download');
        }

        const apiKey = org.libreDteApiKey;
        const companyRut = org.libreDteRut;

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
