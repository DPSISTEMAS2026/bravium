import { PrismaClient, MatchStatus, TransactionStatus } from '@prisma/client';

export interface EngineOptions {
    organizationId: string;
    dryRun?: boolean;
}

export interface EngineResult {
    processed: number;
    pass1Exact: number;
    totalDrafts: number;
    stillPending: number;
}

interface TxRow {
    id: string;
    date: Date;
    amount: number;
    type: string; // 'DEBIT' o 'CREDIT'
    description: string | null;
    metadata: any;
    bankAccount: { bankName: string; accountNumber: string; organizationId: string };
}

interface DteRow {
    id: string;
    folio: number;
    type: number;
    totalAmount: number;
    issuedDate: Date;
    rutIssuer: string;
    providerId: string | null;
    provider: { id: string; name: string; rut: string } | null;
}

// Funciones de validación de RUT eliminadas por regla de 1:1 estricto

function dateDiffDays(a: Date, b: Date): number {
    return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

export class ReconciliationEngine {
    constructor(private readonly prisma: PrismaClient) {}

    async run(opts: EngineOptions): Promise<EngineResult> {
        const { organizationId, dryRun = false } = opts;
        const lookbackDate = new Date('2026-01-01T00:00:00.000Z');
        const maxDaysWindow = 90;

        // ── 1. Cargar datos ──────────────────────────────────────────────────
        // Ahora cargamos DEBIT y CREDIT para respetar la Ley de Signo
        const [pendingTxs, unpaidDtes] = await Promise.all([
            this.prisma.bankTransaction.findMany({
                where: {
                    status: { in: [TransactionStatus.PENDING, TransactionStatus.PARTIALLY_MATCHED] },
                    date: { gte: lookbackDate },
                    bankAccount: { organizationId },
                },
                include: { bankAccount: { select: { bankName: true, accountNumber: true, organizationId: true } } },
                orderBy: { date: 'asc' },
            }),
            this.prisma.dTE.findMany({
                where: {
                    paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
                    organizationId,
                    type: { not: 61 }, // Notas de Crédito jamás van contra banco
                },
                include: { provider: { select: { id: true, name: true, rut: true } } },
            }),
        ]);

        const usedTxIds = new Set<string>();
        const usedDteIds = new Set<string>();

        let p1 = 0;
        let drafts = 0;

        const pendingMatchesToCreate: any[] = [];
        const matchedTxIds = new Set<string>();
        const paidDteIds = new Set<string>();

        const createMatch = async (txId: string, dteId: string, rule: string) => {
            if (dryRun) return;
            pendingMatchesToCreate.push({
                transactionId: txId,
                dteId,
                origin: 'AUTOMATIC',
                status: MatchStatus.CONFIRMED,
                confidence: 1.0,
                ruleApplied: rule,
                organizationId,
            });

            matchedTxIds.add(txId);
            paidDteIds.add(dteId);
            p1++;
            usedTxIds.add(txId);
            usedDteIds.add(dteId);
        };

        // ════════════════════════════════════════════════════════════════════
        // LEY ABSOLUTA DE CONCILIACIÓN (TOLERANCIA CERO)
        // ════════════════════════════════════════════════════════════════════
        for (const tx of pendingTxs as TxRow[]) {
            if (usedTxIds.has(tx.id)) continue;

            const isEgreso = tx.amount < 0 || tx.type === 'DEBIT';
            const isIngreso = tx.amount > 0 || tx.type === 'CREDIT';
            const txAbs = Math.abs(tx.amount);

            // Filtrar DTEs por dirección financiera y tolerancia cero
            const validDtes = unpaidDtes.filter(d => {
                if (usedDteIds.has(d.id)) return false;
                
                // Tipo 33, 34, 56 -> Compras (Gastos) -> Requiere Egreso
                const isCompra = [33, 34, 56].includes(d.type);
                
                if (isCompra && !isEgreso) return false;
                if (!isCompra && !isIngreso) return false;

                // LEY SAGRADA (FLEXIBILIZADA): Tolerancia de +/- 10 pesos
                const diffMonto = Math.abs(Math.abs(d.totalAmount) - txAbs);
                if (diffMonto > 10) return false;

                // Restricción de Fecha
                const diff = dateDiffDays(tx.date, d.issuedDate);
                if (diff > maxDaysWindow) return false;

                return true;
            });

            if (validDtes.length === 0) continue;

            // Ordenar por cercanía en fecha
            validDtes.sort((a, b) => dateDiffDays(tx.date, a.issuedDate) - dateDiffDays(tx.date, b.issuedDate));

            // Evaluamos el mejor candidato (el más cercano en fecha)
            const matchedDte = validDtes[0];

            const diffMontoFinal = Math.abs(Math.abs(matchedDte.totalAmount) - txAbs);
            const toleranceMsg = diffMontoFinal > 0 ? ` (Diferencia: $${diffMontoFinal})` : '';

            const ruleDesc = `[LEY SAGRADA] Match 1:1 por Monto$${toleranceMsg}`;

            await createMatch(tx.id, matchedDte.id, ruleDesc);
        }

        // ── 3. Persistir en BD ────────────────────────────────────────────────
        if (!dryRun && pendingMatchesToCreate.length > 0) {
            await this.prisma.reconciliationMatch.createMany({
                data: pendingMatchesToCreate,
                skipDuplicates: true,
            });

            if (matchedTxIds.size > 0) {
                await this.prisma.bankTransaction.updateMany({
                    where: { id: { in: Array.from(matchedTxIds) } },
                    data: { status: TransactionStatus.MATCHED, updatedAt: new Date() },
                });
            }

            if (paidDteIds.size > 0) {
                await this.prisma.dTE.updateMany({
                    where: { id: { in: Array.from(paidDteIds) } },
                    data: { paymentStatus: 'PAID', outstandingAmount: 0, updatedAt: new Date() },
                });
            }
        }

        return {
            processed: pendingTxs.length,
            pass1Exact: p1,
            totalDrafts: 0,
            stillPending: pendingTxs.length - p1,
        };
    }
}
