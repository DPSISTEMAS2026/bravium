import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DataOrigin, TransactionStatus, TransactionType } from '@prisma/client';

@Injectable()
export class FintocService {
    private readonly logger = new Logger(FintocService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Sincroniza movimientos desde Fintoc para una organización específica.
     */
    async syncTransactions(organizationId: string, apiKey: string, linkToken?: string) {
        this.logger.log(`Syncing transactions from REAL Fintoc for Org: ${organizationId}`);
        
        // Si no hay linkToken, intentamos listar los links activos de esta API Key
        let targetLinkToken = linkToken;
        if (!targetLinkToken) {
            this.logger.warn(`No linkToken provided for Org ${organizationId}, attempting to discover active links...`);
            const linksResponse = await fetch('https://api.fintoc.com/v1/links', {
                headers: { 'Authorization': apiKey }
            });
            if (linksResponse.ok) {
                const links: any = await linksResponse.json();
                if (links.length > 0) {
                    targetLinkToken = links[0].link_token; // Usamos el primero encontrado para la demo
                    this.logger.log(`Found active link: ${links[0].id} (username: ${links[0].username})`);
                }
            }
        }

        if (!targetLinkToken) {
            this.logger.error(`No active Fintoc Links found for Org ${organizationId}. Please link a bank account.`);
            return { totalSynced: 0, created: 0, error: 'Missing Link Token' };
        }
        
        try {
            // 1. Obtener Cuentas vinculadas al Link
            const accountsResponse = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${targetLinkToken}`, {
                headers: { 'Authorization': apiKey }
            });

            if (!accountsResponse.ok) {
                const errorBody = await accountsResponse.text();
                this.logger.error(`Fintoc API Error (Accounts): ${accountsResponse.status} ${accountsResponse.statusText} - Body: ${errorBody}`);
                throw new Error(`Fintoc API Error (Accounts): ${accountsResponse.statusText}`);
            }

            const accounts: any = await accountsResponse.json();
            let totalCreated = 0;
            let totalExisting = 0;

            for (const acc of accounts) {
                // Sincronizar cada cuenta
                const result = await this.syncAccountMovements(organizationId, apiKey, targetLinkToken, acc);
                totalCreated += result.created;
                totalExisting += result.existing;
            }

            return { totalSynced: totalCreated + totalExisting, created: totalCreated, existing: totalExisting };
        } catch (error) {
            this.logger.error(`Fintoc real sync failed: ${error.message}`);
            throw error;
        }
    }

    private async syncAccountMovements(organizationId: string, apiKey: string, linkToken: string, account: any) {
        const accId = account.id;
        const bankName = account.institution.name || 'Fintoc Bank';
        
        // 2. Obtener movimientos (últimos 30 días por defecto)
        const movementsResponse = await fetch(`https://api.fintoc.com/v1/accounts/${accId}/movements?link_token=${linkToken}`, {
            headers: { 'Authorization': apiKey }
        });

        if (!movementsResponse.ok) {
            this.logger.error(`Failed to fetch movements for account ${accId}: ${movementsResponse.statusText}`);
            return { created: 0, existing: 0 };
        }

        const movements: any = await movementsResponse.json();
        let created = 0;
        let existing = 0;

        // 3. Buscar o crear la cuenta bancaria localmente
        let bankAccount = await this.prisma.bankAccount.findFirst({
            where: { 
                organizationId,
                accountNumber: account.number || accId
            }
        });

        if (!bankAccount) {
            const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
            bankAccount = await this.prisma.bankAccount.create({
                data: {
                    bankName: `${bankName} (Fintoc)`,
                    accountNumber: account.number || accId,
                    currency: account.currency || 'CLP',
                    rutHolder: org?.rut || 'N/A',
                    organization: { connect: { id: organizationId } }
                }
            });
        }

        for (const mov of movements) {
            const externalId = mov.id;
            
            const alreadyExists = await this.prisma.bankTransaction.findFirst({
                where: {
                    OR: [
                        { metadata: { path: ['fintocId'], equals: externalId } }
                    ]
                }
            });

            if (alreadyExists) {
                existing++;
                continue;
            }

            // Fallback dedup: Fintoc genera IDs diferentes para el mismo movimiento en cada paginación.
            // Verificar por (cuenta + fecha + monto + descripción) para evitar duplicados.
            const rawDateStr = mov.post_date || mov.created_at;
            const checkDate = rawDateStr ? new Date(rawDateStr) : new Date();
            const duplicateByContent = await this.prisma.bankTransaction.findFirst({
                where: {
                    bankAccountId: bankAccount.id,
                    amount: mov.amount,
                    description: mov.description || 'Movimiento Fintoc',
                    date: checkDate,
                }
            });

            if (duplicateByContent) {
                existing++;
                continue;
            }

            let finalDate = new Date(rawDateStr);
            // Fix timezone discrepancy for dates retrieved at midnight UTC
            if (rawDateStr && typeof rawDateStr === 'string' && rawDateStr.includes('T00:00:00Z')) {
                finalDate.setUTCHours(12, 0, 0, 0);
            }

            await this.prisma.bankTransaction.create({
                data: {
                    bankAccountId: bankAccount.id,
                    amount: mov.amount,
                    description: mov.description || 'Movimiento Fintoc',
                    date: finalDate,
                    reference: mov.recipient_account?.number || externalId,
                    type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
                    status: TransactionStatus.PENDING,
                    origin: DataOrigin.API_INTEGRATION,
                    metadata: {
                        fintocId: externalId,
                        fintocAccount: accId,
                        syncDate: new Date().toISOString(),
                        raw: mov
                    }
                }
            });
            created++;
        }

        return { created, existing };
    }
}
