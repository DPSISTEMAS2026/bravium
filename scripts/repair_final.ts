import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';
const DRY_RUN = process.argv.includes('--dry-run');
const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

interface FixAction {
    folio: number;
    empresa: string;
    txId: string;
    txDesc: string;
    txAmount: number;
    txDate: string;
    dteId: string;
    note: string;
}

async function main() {
    console.log(`\n${DRY_RUN ? '🔍 DRY RUN' : '🔧 EJECUCIÓN'}\n`);
    
    const fixes: FixAction[] = [];

    // Helper: find TX and prepare fix
    async function findAndPrepare(folio: number, empresa: string, dteId: string, amount: number, dateHint: string, note: string, excludeIds: string[] = []) {
        const target = -amount;
        const d = dateHint ? new Date(dateHint) : null;
        
        const candidates = await p.bankTransaction.findMany({
            where: {
                bankAccount: { organizationId: ORG },
                amount: target,
                id: { notIn: excludeIds },
                status: { in: ['PENDING', 'UNMATCHED'] },
                ...(d ? { date: { gte: new Date(d.getTime() - 30*86400000), lte: new Date(d.getTime() + 30*86400000) } } : {}),
            },
            take: 1,
        });
        
        if (candidates.length > 0) {
            const tx = candidates[0];
            fixes.push({
                folio, empresa, txId: tx.id, dteId,
                txDesc: tx.description?.substring(0, 50) || '',
                txAmount: tx.amount,
                txDate: tx.date?.toISOString().slice(0, 10) || '',
                note,
            });
            return tx.id;
        }
        return null;
    }

    // ═══ LATAM 5419109: Falta $15M — la TX "Traspaso Internet a T. Crédito" del 30/03 en realidad es pago LATAM ═══
    const latam = await p.dTE.findFirst({ where: { folio: 5419109, provider: { organizationId: ORG } } });
    if (latam) {
        // The remaining $15M — search for any $15M tx to LATAM RUT or "T. Crédito" that's free
        const tx15m = await p.bankTransaction.findFirst({
            where: {
                bankAccount: { organizationId: ORG },
                amount: -15000000,
                status: { in: ['PENDING', 'MATCHED'] },
                date: { gte: new Date('2026-03-15'), lte: new Date('2026-04-05') },
                // Exclude the one already matched to LATAM
                id: { notIn: (await p.reconciliationMatch.findMany({ where: { dteId: latam.id }, select: { transactionId: true } })).map(m => m.transactionId).filter(Boolean) as string[] },
            },
        });
        if (tx15m) {
            // Check if this TX has 0 matches pointing to our DTE
            const existingMatch = await p.reconciliationMatch.findFirst({
                where: { transactionId: tx15m.id, dteId: latam.id },
            });
            if (!existingMatch) {
                fixes.push({
                    folio: 5419109, empresa: 'LATAM', txId: tx15m.id, dteId: latam.id,
                    txDesc: tx15m.description?.substring(0, 50) || '',
                    txAmount: tx15m.amount,
                    txDate: tx15m.date?.toISOString().slice(0, 10) || '',
                    note: 'LATAM 2do pago $15M — Excel row 153 MARZO',
                });
            }
        }
    }

    // ═══ MERIEUX 113951: $731.064 LIBRE el 22/01 ═══
    const merieux = await p.dTE.findFirst({ where: { folio: 113951, provider: { organizationId: ORG } } });
    if (merieux) await findAndPrepare(113951, 'MERIEUX', merieux.id, 731064, '2026-01-22', 'Pago OC BL0600004657');

    // ═══ CERCANO 10520: $84.492 LIBRE el 13/01 ═══
    const cercano = await p.dTE.findFirst({ where: { folio: 10520, provider: { organizationId: ORG } } });
    if (cercano) await findAndPrepare(10520, 'CERCANO', cercano.id, 84492, '2026-01-13', 'Pago enero');

    // ═══ SOCIEDAD TURISTICA — multiple folios using same TX $198.900 ═══
    // These TX at 76.594.462-7 are already matched to other folios — they're "one TX, many DTEs" 
    // We need to match the remaining folios to available TX
    const stFolios = [879, 912, 843];
    for (const folio of stFolios) {
        const dte = await p.dTE.findFirst({ where: { folio, provider: { organizationId: ORG } } });
        if (dte && dte.paymentStatus !== 'PAID') {
            const existing = await p.reconciliationMatch.findMany({ where: { dteId: dte.id }, select: { transactionId: true } });
            const excludeIds = existing.map(m => m.transactionId).filter(Boolean) as string[];
            await findAndPrepare(folio, 'SOC. TURISTICA', dte.id, 198900, '2026-04-01', `Folio ${folio} Soc Turistica`, excludeIds);
        }
    }

    // ═══ ATAKAMA 6650: $131.139 — TX is matched to another DTE, look for alternatives ═══
    const atakama = await p.dTE.findFirst({ where: { folio: 6650, provider: { organizationId: ORG } } });
    if (atakama) await findAndPrepare(6650, 'ATAKAMA OUTDOOR', atakama.id, 131139, '2026-02-05', 'Pago Atakama febrero');

    // ═══ VETO 894428: $466.626 ═══
    const veto = await p.dTE.findFirst({ where: { folio: 894428, provider: { organizationId: ORG } } });
    if (veto) await findAndPrepare(894428, 'VETO Y CIA', veto.id, 466626, '2026-03-20', 'Pago Veto marzo');

    // ═══ ITEM 1260032: $449.970 ═══
    const item = await p.dTE.findFirst({ where: { folio: 1260032, provider: { organizationId: ORG } } });
    if (item) await findAndPrepare(1260032, 'ITEM', item.id, 449970, '2026-02-17', 'Pago ITEM febrero');

    // ═══ JARA MENDEZ 26859: $511.331 + $154.247 ═══
    const jara = await p.dTE.findFirst({ where: { folio: 26859, provider: { organizationId: ORG } } });
    if (jara) {
        const id1 = await findAndPrepare(26859, 'JARA MENDEZ', jara.id, 511331, '2026-02-17', 'Pago principal Jara');
        const excludes = id1 ? [id1] : [];
        await findAndPrepare(26859, 'JARA MENDEZ', jara.id, 154247, '2026-01-09', 'Pago parcial Jara', excludes);
    }

    // ═══ LOGINSA 7192: falta $7M — buscar TX LOGINSA libres ═══
    const loginsa7192 = await p.dTE.findFirst({ where: { folio: 7192, provider: { organizationId: ORG } } });
    if (loginsa7192) {
        // There's a $15M TX to LOGINSA on 2/20 that's PENDING 
        const txLoginsa = await p.bankTransaction.findFirst({
            where: {
                bankAccount: { organizationId: ORG },
                amount: -15000000,
                status: 'PENDING',
                description: { contains: 'LOGINSA', mode: 'insensitive' },
            },
        });
        if (txLoginsa) {
            fixes.push({
                folio: 7192, empresa: 'LOGINSA', txId: txLoginsa.id, dteId: loginsa7192.id,
                txDesc: txLoginsa.description?.substring(0, 50) || '',
                txAmount: txLoginsa.amount,
                txDate: txLoginsa.date?.toISOString().slice(0, 10) || '',
                note: 'LOGINSA $15M libre — pago split entre 7192 y 7092',
            });
        }
    }

    // ═══ Print & Execute fixes ═══
    console.log(`\n═══ ${fixes.length} MATCHES A CREAR ═══\n`);
    for (const fix of fixes) {
        console.log(`✅ Folio ${fix.folio} [${fix.empresa}]`);
        console.log(`   TX: ${fix.txDate} | ${fmt(fix.txAmount)} | "${fix.txDesc}"`);
        console.log(`   ${fix.note}`);
    }

    if (!DRY_RUN && fixes.length > 0) {
        console.log('\n🔧 Aplicando...');
        for (const fix of fixes) {
            await p.reconciliationMatch.create({
                data: {
                    transactionId: fix.txId,
                    dteId: fix.dteId,
                    organizationId: ORG,
                    status: 'CONFIRMED',
                    origin: 'MANUAL',
                    confidence: 1.0,
                    ruleApplied: 'EXCEL_DEEP_CROSS_REF',
                    notes: fix.note,
                },
            });
            await p.bankTransaction.update({
                where: { id: fix.txId },
                data: { status: 'MATCHED' },
            });
        }

        // Recalculate outstanding for all affected DTEs
        const affectedDteIds = [...new Set(fixes.map(f => f.dteId))];
        console.log(`\n💰 Recalculando outstanding para ${affectedDteIds.length} DTEs...`);
        
        for (const dteId of affectedDteIds) {
            const dte = await p.dTE.findUnique({ where: { id: dteId } });
            if (!dte) continue;
            
            const confirmed = await p.reconciliationMatch.findMany({
                where: { dteId, status: 'CONFIRMED' },
                include: { transaction: { select: { amount: true } } },
            });
            const totalPaid = confirmed.reduce((s, m) => s + Math.abs(m.transaction?.amount || 0), 0);
            const newOutstanding = Math.max(0, dte.totalAmount - totalPaid);
            const newStatus = newOutstanding <= 0 ? 'PAID' : (totalPaid > 0 ? 'PARTIAL' : 'UNPAID');
            
            console.log(`  Folio ${dte.folio}: ${fmt(dte.outstandingAmount)} → ${fmt(newOutstanding)} | ${dte.paymentStatus} → ${newStatus}`);
            await p.dTE.update({
                where: { id: dteId },
                data: { outstandingAmount: newOutstanding, paymentStatus: newStatus as any },
            });
        }
    }

    // Also fix all DTEs that have $0 or $1 outstanding but are still PARTIAL
    console.log('\n═══ LIMPIEZA: DTEs con outstanding ≤ $100 que no son PAID ═══');
    const almostPaid = await p.dTE.findMany({
        where: {
            provider: { organizationId: ORG },
            paymentStatus: { not: 'PAID' },
            outstandingAmount: { lte: 100 },
            issuedDate: { gte: new Date('2026-01-01') },
        },
    });
    for (const d of almostPaid) {
        console.log(`  Folio ${d.folio}: outstanding=${fmt(d.outstandingAmount)} → PAID`);
        if (!DRY_RUN) {
            await p.dTE.update({
                where: { id: d.id },
                data: { outstandingAmount: 0, paymentStatus: 'PAID' },
            });
        }
    }

    console.log(`\n${DRY_RUN ? '⚠️ DRY RUN' : '✅ CAMBIOS APLICADOS'}`);
}

main().catch(console.error).finally(() => p.$disconnect());
