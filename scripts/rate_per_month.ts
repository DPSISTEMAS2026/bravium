import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
    // TX por mes con status
    const txByMonth = await p.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(bt.date, 'YYYY-MM') as mes,
            COUNT(*) as total,
            COUNT(CASE WHEN bt.status = 'MATCHED' THEN 1 END) as matched,
            COUNT(CASE WHEN bt.status = 'PARTIALLY_MATCHED' THEN 1 END) as partial,
            COUNT(CASE WHEN bt.status = 'PENDING' THEN 1 END) as pending,
            COUNT(CASE WHEN bt.status = 'UNMATCHED' THEN 1 END) as unmatched
        FROM bank_transactions bt
        JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
        WHERE ba."organizationId" = ${ORG}
          AND bt.date >= '2025-12-01'::date
        GROUP BY TO_CHAR(bt.date, 'YYYY-MM')
        ORDER BY mes
    `;

    // DTEs por mes con status
    const dteByMonth = await p.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(d."issuedDate", 'YYYY-MM') as mes,
            COUNT(*) as total,
            COUNT(CASE WHEN d."paymentStatus" = 'PAID' THEN 1 END) as paid,
            COUNT(CASE WHEN d."paymentStatus" = 'UNPAID' THEN 1 END) as unpaid
        FROM dtes d
        WHERE d."organizationId" = ${ORG}
          AND d."issuedDate" >= '2025-12-01'::date
        GROUP BY TO_CHAR(d."issuedDate", 'YYYY-MM')
        ORDER BY mes
    `;

    // Matches confirmados por mes de la TX asociada
    const matchByTxMonth = await p.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(bt.date, 'YYYY-MM') as mes,
            COUNT(DISTINCT rm.id) as matches_total,
            COUNT(DISTINCT CASE WHEN rm.status = 'CONFIRMED' THEN rm.id END) as confirmed,
            COUNT(DISTINCT CASE WHEN rm.status = 'DRAFT' THEN rm.id END) as draft,
            COUNT(DISTINCT rm."dteId") as dtes_cubiertas
        FROM reconciliation_matches rm
        JOIN bank_transactions bt ON rm."transactionId" = bt.id
        WHERE rm."organizationId" = ${ORG}
          AND rm.status != 'REJECTED'
          AND bt.date >= '2025-12-01'::date
        GROUP BY TO_CHAR(bt.date, 'YYYY-MM')
        ORDER BY mes
    `;

    console.log('═'.repeat(80));
    console.log('  📊 TASA DE CONCILIACIÓN POR MES — Bravium SpA');
    console.log('═'.repeat(80));

    console.log('\n  📅 TRANSACCIONES BANCARIAS');
    console.log('  ─'.repeat(38));
    console.log('  Mes      │ Total │ Matched │ Partial │ Pending │ Unm  │ Tasa Match │ Tasa Comb.');
    console.log('  ─'.repeat(38));
    for (const r of txByMonth) {
        const t = Number(r.total);
        const m = Number(r.matched);
        const pa = Number(r.partial);
        const rate = ((m/t)*100).toFixed(1);
        const comb = (((m+pa)/t)*100).toFixed(1);
        const bar = '█'.repeat(Math.round(Number(comb)/2.5));
        console.log(`  ${r.mes} │ ${String(t).padStart(5)} │ ${String(m).padStart(7)} │ ${String(pa).padStart(7)} │ ${String(r.pending).padStart(7)} │ ${String(r.unmatched).padStart(4)} │ ${rate.padStart(9)}% │ ${comb.padStart(9)}%  ${bar}`);
    }

    console.log('\n\n  📄 DTEs (FACTURAS)');
    console.log('  ─'.repeat(38));
    console.log('  Mes      │ Total │ Paid  │ Unpaid │ Tasa Pago');
    console.log('  ─'.repeat(38));
    for (const r of dteByMonth) {
        const t = Number(r.total);
        const paid = Number(r.paid);
        const rate = ((paid/t)*100).toFixed(1);
        const bar = '█'.repeat(Math.round(Number(rate)/2.5));
        console.log(`  ${r.mes} │ ${String(t).padStart(5)} │ ${String(paid).padStart(5)} │ ${String(r.unpaid).padStart(6)} │ ${rate.padStart(8)}%  ${bar}`);
    }

    console.log('\n\n  🔗 MATCHES ACTIVOS (por mes de la TX)');
    console.log('  ─'.repeat(38));
    console.log('  Mes      │ Matches │ Confirmed │ Draft │ DTEs cubiertas');
    console.log('  ─'.repeat(38));
    for (const r of matchByTxMonth) {
        console.log(`  ${r.mes} │ ${String(r.matches_total).padStart(7)} │ ${String(r.confirmed).padStart(9)} │ ${String(r.draft).padStart(5)} │ ${String(r.dtes_cubiertas).padStart(14)}`);
    }

    console.log('\n✅ Reporte completado\n');
}
main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => p.$disconnect());
