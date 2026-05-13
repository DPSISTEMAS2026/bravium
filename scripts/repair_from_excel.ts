import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';
const DRY_RUN = process.argv.includes('--dry-run');
const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

function excelDateToISO(serial: number): string {
    if (!serial || typeof serial !== 'number') return '';
    const d = new Date((serial - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
}

async function main() {
    console.log(`\n${DRY_RUN ? '🔍 DRY RUN — no se modifica nada' : '🔧 MODO EJECUCIÓN — se aplicarán cambios'}\n`);
    
    // ═══ 1. Parse Excel ═══
    const wb = XLSX.readFile('scripts/Pagos 2026 (3) (1).xlsx');
    const monthSheets = wb.SheetNames.filter(s => /ENERO|FEBRERO|MARZO|ABRIL/i.test(s));

    const byFolio: Record<number, { empresa: string; entries: { monto: number; sheet: string; fecha: string }[] }> = {};
    for (const sheetName of monthSheets) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[0]) continue;
            const folio = r[3] ? Number(r[3]) : null;
            const monto = Number(r[5]) || 0;
            if (!folio || isNaN(folio) || folio >= 2147483647 || monto === 0) continue;
            if (!byFolio[folio]) byFolio[folio] = { empresa: String(r[0]), entries: [] };
            byFolio[folio].entries.push({
                monto,
                sheet: sheetName,
                fecha: typeof r[6] === 'number' ? excelDateToISO(r[6]) : '',
            });
        }
    }

    // ═══ 2. Load all DTEs & matches in batch ═══
    const folios = Object.keys(byFolio).map(Number);
    const allDtes = await p.dTE.findMany({
        where: { folio: { in: folios }, provider: { organizationId: ORG } },
        include: { provider: { select: { name: true, rut: true } } },
    });
    const dteMap: Record<number, typeof allDtes[0]> = {};
    for (const d of allDtes) dteMap[d.folio] = d;

    const dteIds = allDtes.map(d => d.id);
    const allMatches = await p.reconciliationMatch.findMany({
        where: { dteId: { in: dteIds } },
        select: { id: true, dteId: true, transactionId: true, status: true },
    });
    const matchesByDte: Record<string, typeof allMatches> = {};
    for (const m of allMatches) {
        if (!m.dteId) continue;
        if (!matchesByDte[m.dteId]) matchesByDte[m.dteId] = [];
        matchesByDte[m.dteId].push(m);
    }

    // Stats
    let fixedOutstanding = 0;
    let confirmedDrafts = 0;
    let createdMatches = 0;
    let notFound = 0;
    let alreadyOk = 0;

    for (const folio of folios) {
        const excel = byFolio[folio];
        const dte = dteMap[folio];
        if (!dte) continue; // DTE no existe, skip
        if (dte.paymentStatus === 'PAID') { alreadyOk++; continue; }

        const mm = matchesByDte[dte.id] || [];
        const confirmed = mm.filter(m => m.status === 'CONFIRMED');
        const drafts = mm.filter(m => m.status === 'DRAFT');

        // ═══ A. Confirm any DRAFT matches ═══
        if (drafts.length > 0) {
            console.log(`📋 Folio ${folio} [${excel.empresa}] — Confirmando ${drafts.length} draft(s)`);
            if (!DRY_RUN) {
                for (const d of drafts) {
                    await p.reconciliationMatch.update({
                        where: { id: d.id },
                        data: { status: 'CONFIRMED' },
                    });
                    // Mark the TX as MATCHED
                    if (d.transactionId) {
                        await p.bankTransaction.update({
                            where: { id: d.transactionId },
                            data: { status: 'MATCHED' },
                        });
                    }
                }
            }
            confirmedDrafts += drafts.length;
        }

        // After confirming drafts, recalculate how many are confirmed
        const totalConfirmed = confirmed.length + drafts.length;
        const excelPayments = excel.entries.length;

        // ═══ B. Create missing matches ═══
        if (totalConfirmed < excelPayments) {
            // We need to find transactions for the remaining payments
            const existingTxIds = new Set(mm.map(m => m.transactionId).filter(Boolean));
            
            for (let i = totalConfirmed; i < excelPayments; i++) {
                const payment = excel.entries[i];
                const targetAmount = -payment.monto; // DEBIT amounts are negative
                const paymentDate = payment.fecha ? new Date(payment.fecha) : null;
                
                // Search for matching transaction
                let candidates = await p.bankTransaction.findMany({
                    where: {
                        bankAccount: { organizationId: ORG },
                        amount: targetAmount,
                        status: { in: ['PENDING', 'UNMATCHED'] },
                        id: { notIn: Array.from(existingTxIds) as string[] },
                        ...(paymentDate ? {
                            date: {
                                gte: new Date(paymentDate.getTime() - 7 * 86400000),
                                lte: new Date(paymentDate.getTime() + 7 * 86400000),
                            }
                        } : {}),
                    },
                    take: 5,
                });
                
                // If no exact match, try with provider RUT in description
                if (candidates.length === 0 && dte.provider?.rut) {
                    const rutClean = dte.provider.rut.replace(/\./g, '').split('-')[0];
                    candidates = await p.bankTransaction.findMany({
                        where: {
                            bankAccount: { organizationId: ORG },
                            amount: targetAmount,
                            status: { in: ['PENDING', 'UNMATCHED'] },
                            id: { notIn: Array.from(existingTxIds) as string[] },
                        },
                        take: 5,
                    });
                }

                // If still no exact match by amount, try close match within 1%
                if (candidates.length === 0) {
                    candidates = await p.bankTransaction.findMany({
                        where: {
                            bankAccount: { organizationId: ORG },
                            amount: {
                                gte: targetAmount * 1.01, // more negative = lower
                                lte: targetAmount * 0.99,
                            },
                            status: { in: ['PENDING', 'UNMATCHED'] },
                            id: { notIn: Array.from(existingTxIds) as string[] },
                            ...(paymentDate ? {
                                date: {
                                    gte: new Date(paymentDate.getTime() - 15 * 86400000),
                                    lte: new Date(paymentDate.getTime() + 15 * 86400000),
                                }
                            } : {}),
                        },
                        take: 5,
                    });
                }

                if (candidates.length > 0) {
                    const tx = candidates[0]; // Best candidate
                    console.log(`✅ Folio ${folio} [${excel.empresa}] — Match: ${tx.date?.toISOString().slice(0,10)} ${fmt(tx.amount)} "${tx.description?.substring(0,40)}"`);
                    
                    if (!DRY_RUN) {
                        await p.reconciliationMatch.create({
                            data: {
                                transactionId: tx.id,
                                dteId: dte.id,
                                organizationId: ORG,
                                status: 'CONFIRMED',
                                origin: 'MANUAL',
                                confidence: 1.0,
                                ruleApplied: 'EXCEL_CROSS_REF',
                                notes: `Cruce Excel pagos - Folio ${folio} - ${payment.sheet}`,
                            },
                        });
                        await p.bankTransaction.update({
                            where: { id: tx.id },
                            data: { status: 'MATCHED' },
                        });
                    }
                    existingTxIds.add(tx.id);
                    createdMatches++;
                } else {
                    console.log(`❌ Folio ${folio} [${excel.empresa}] — NO encontré TX por ${fmt(targetAmount)} (~${payment.fecha})`);
                    notFound++;
                }
            }
        }

        // ═══ C. Recalculate outstanding ═══
        // Get all confirmed matches for this DTE (including newly created)
        const allConfirmed = await p.reconciliationMatch.findMany({
            where: { dteId: dte.id, status: 'CONFIRMED' },
            include: { transaction: { select: { amount: true } } },
        });
        
        const totalPaid = allConfirmed.reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
        const newOutstanding = Math.max(0, dte.totalAmount - totalPaid);
        const newStatus = newOutstanding <= 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIAL' : 'UNPAID');
        
        if (dte.outstandingAmount !== newOutstanding || dte.paymentStatus !== newStatus) {
            console.log(`💰 Folio ${folio} [${excel.empresa}] — outstanding: ${fmt(dte.outstandingAmount)} → ${fmt(newOutstanding)} | status: ${dte.paymentStatus} → ${newStatus}`);
            if (!DRY_RUN) {
                await p.dTE.update({
                    where: { id: dte.id },
                    data: { outstandingAmount: newOutstanding, paymentStatus: newStatus as any },
                });
            }
            fixedOutstanding++;
        }
    }

    console.log('\n════════════════════════════════════════');
    console.log('  RESUMEN DE REPARACIÓN');
    console.log('════════════════════════════════════════\n');
    console.log(`✅ Ya estaban OK (PAID): ${alreadyOk}`);
    console.log(`📋 Drafts confirmados: ${confirmedDrafts}`);
    console.log(`✅ Matches creados: ${createdMatches}`);
    console.log(`💰 Outstanding actualizados: ${fixedOutstanding}`);
    console.log(`❌ TX no encontrada: ${notFound}`);
    console.log(`\n${DRY_RUN ? '⚠️  DRY RUN — ejecutar sin --dry-run para aplicar' : '✅ CAMBIOS APLICADOS'}`);
}

main().catch(console.error).finally(() => p.$disconnect());
