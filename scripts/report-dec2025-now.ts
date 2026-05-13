/**
 * Reporte detallado Bravium: Diciembre 2025 → Abril 2026
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ORG_ID = '715545b8-4522-4bb1-be81-3047546c0e8c';
const FROM = '2025-12-01';
const TO = '2026-04-30';

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

async function main() {
    console.log('='.repeat(80));
    console.log('  📊 REPORTE BRAVIUM SpA — Dic 2025 → Abr 2026');
    console.log('  Generado:', new Date().toISOString());
    console.log('='.repeat(80));

    // ── TRANSACCIONES POR MES ──
    const txByMonth = await prisma.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(bt.date, 'YYYY-MM') as mes,
            COUNT(*) as total,
            COUNT(CASE WHEN bt.status = 'MATCHED' THEN 1 END) as matched,
            COUNT(CASE WHEN bt.status = 'PENDING' THEN 1 END) as pending,
            COUNT(CASE WHEN bt.status = 'PARTIALLY_MATCHED' THEN 1 END) as partial,
            COUNT(CASE WHEN bt.status = 'UNMATCHED' THEN 1 END) as unmatched,
            COALESCE(SUM(CASE WHEN bt.type = 'DEBIT' THEN ABS(bt.amount) ELSE 0 END), 0) as total_egresos,
            COALESCE(SUM(CASE WHEN bt.type = 'CREDIT' THEN bt.amount ELSE 0 END), 0) as total_ingresos
        FROM bank_transactions bt
        JOIN bank_accounts ba ON bt."bankAccountId" = ba.id
        WHERE ba."organizationId" = ${ORG_ID}
          AND bt.date >= ${FROM}::date
          AND bt.date <= ${TO}::date
        GROUP BY TO_CHAR(bt.date, 'YYYY-MM')
        ORDER BY mes
    `;

    console.log('\n  📅 TRANSACCIONES BANCARIAS POR MES');
    console.log('  ' + '─'.repeat(76));
    console.log('  Mes       | Total | Matched | Pending | Partial | Unm  | Egresos         | Ingresos');
    console.log('  ' + '─'.repeat(76));
    let txGrandTotal = 0, txGrandMatched = 0, txGrandPending = 0;
    for (const r of txByMonth) {
        const total = Number(r.total);
        const matched = Number(r.matched);
        const pending = Number(r.pending);
        const partial = Number(r.partial);
        const unmatched = Number(r.unmatched);
        txGrandTotal += total;
        txGrandMatched += matched;
        txGrandPending += pending;
        console.log(`  ${r.mes}   | ${String(total).padStart(5)} | ${String(matched).padStart(7)} | ${String(pending).padStart(7)} | ${String(partial).padStart(7)} | ${String(unmatched).padStart(4)} | ${fmt(Number(r.total_egresos)).padStart(15)} | ${fmt(Number(r.total_ingresos)).padStart(15)}`);
    }
    console.log('  ' + '─'.repeat(76));
    console.log(`  TOTAL     | ${String(txGrandTotal).padStart(5)} | ${String(txGrandMatched).padStart(7)} | ${String(txGrandPending).padStart(7)} |`);

    // ── DTEs POR MES ──
    const dteByMonth = await prisma.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(d."issuedDate", 'YYYY-MM') as mes,
            COUNT(*) as total,
            COUNT(CASE WHEN d."paymentStatus" = 'PAID' THEN 1 END) as paid,
            COUNT(CASE WHEN d."paymentStatus" = 'UNPAID' THEN 1 END) as unpaid,
            COUNT(CASE WHEN d."paymentStatus" = 'PARTIAL' THEN 1 END) as partial,
            COALESCE(SUM(d."totalAmount"), 0) as monto_total,
            COALESCE(SUM(d."outstandingAmount"), 0) as monto_pendiente
        FROM dtes d
        WHERE d."organizationId" = ${ORG_ID}
          AND d."issuedDate" >= ${FROM}::date
          AND d."issuedDate" <= ${TO}::date
        GROUP BY TO_CHAR(d."issuedDate", 'YYYY-MM')
        ORDER BY mes
    `;

    console.log('\n\n  📄 DTEs (FACTURAS) POR MES');
    console.log('  ' + '─'.repeat(76));
    console.log('  Mes       | Total | Paid  | Unpaid | Partial | Monto Total      | Pendiente');
    console.log('  ' + '─'.repeat(76));
    let dteGrandTotal = 0, dteGrandPaid = 0, dteGrandUnpaid = 0;
    for (const r of dteByMonth) {
        const total = Number(r.total);
        const paid = Number(r.paid);
        const unpaid = Number(r.unpaid);
        const partial = Number(r.partial);
        dteGrandTotal += total;
        dteGrandPaid += paid;
        dteGrandUnpaid += unpaid;
        console.log(`  ${r.mes}   | ${String(total).padStart(5)} | ${String(paid).padStart(5)} | ${String(unpaid).padStart(6)} | ${String(partial).padStart(7)} | ${fmt(Number(r.monto_total)).padStart(16)} | ${fmt(Number(r.monto_pendiente)).padStart(16)}`);
    }
    console.log('  ' + '─'.repeat(76));
    console.log(`  TOTAL     | ${String(dteGrandTotal).padStart(5)} | ${String(dteGrandPaid).padStart(5)} | ${String(dteGrandUnpaid).padStart(6)} |`);

    // ── MATCHES POR MES ──
    const matchByMonth = await prisma.$queryRaw<any[]>`
        SELECT 
            TO_CHAR(rm."createdAt", 'YYYY-MM') as mes,
            COUNT(*) as total,
            COUNT(CASE WHEN rm.status = 'CONFIRMED' THEN 1 END) as confirmed,
            COUNT(CASE WHEN rm.status = 'DRAFT' THEN 1 END) as draft,
            COUNT(CASE WHEN rm.status = 'REJECTED' THEN 1 END) as rejected,
            COUNT(CASE WHEN rm.origin = 'AUTOMATIC' THEN 1 END) as auto,
            COUNT(CASE WHEN rm.origin = 'MANUAL' THEN 1 END) as manual
        FROM reconciliation_matches rm
        WHERE rm."organizationId" = ${ORG_ID}
          AND rm."createdAt" >= ${FROM}::date
          AND rm."createdAt" <= (${TO}::date + interval '1 day')
        GROUP BY TO_CHAR(rm."createdAt", 'YYYY-MM')
        ORDER BY mes
    `;

    console.log('\n\n  🔗 MATCHES DE CONCILIACIÓN POR MES');
    console.log('  ' + '─'.repeat(76));
    console.log('  Mes       | Total | Confirmed | Draft | Rejected | Auto  | Manual');
    console.log('  ' + '─'.repeat(76));
    let mGrandTotal = 0, mGrandConf = 0, mGrandDraft = 0;
    for (const r of matchByMonth) {
        const total = Number(r.total);
        mGrandTotal += total;
        mGrandConf += Number(r.confirmed);
        mGrandDraft += Number(r.draft);
        console.log(`  ${r.mes}   | ${String(total).padStart(5)} | ${String(r.confirmed).padStart(9)} | ${String(r.draft).padStart(5)} | ${String(r.rejected).padStart(8)} | ${String(r.auto).padStart(5)} | ${String(r.manual).padStart(6)}`);
    }
    console.log('  ' + '─'.repeat(76));
    console.log(`  TOTAL     | ${String(mGrandTotal).padStart(5)} | ${String(mGrandConf).padStart(9)} | ${String(mGrandDraft).padStart(5)} |`);

    // ── SUGERENCIAS ──
    const suggestions = await prisma.matchSuggestion.groupBy({
        by: ['status'],
        where: { organizationId: ORG_ID },
        _count: true
    });
    console.log('\n\n  💡 SUGERENCIAS PENDIENTES');
    suggestions.forEach(s => console.log(`     ${s.status}: ${s._count}`));

    // ── PROVEEDORES TOP POR DEUDA ──
    const topProviders = await prisma.$queryRaw<any[]>`
        SELECT 
            p.name,
            p.rut,
            COUNT(d.id) as dte_count,
            SUM(d."totalAmount") as total,
            SUM(d."outstandingAmount") as pendiente
        FROM dtes d
        JOIN providers p ON d."providerId" = p.id
        WHERE d."organizationId" = ${ORG_ID}
          AND d."paymentStatus" = 'UNPAID'
          AND d."issuedDate" >= ${FROM}::date
        GROUP BY p.id, p.name, p.rut
        ORDER BY pendiente DESC
        LIMIT 10
    `;

    console.log('\n\n  🏢 TOP 10 PROVEEDORES CON DEUDA PENDIENTE (desde Dic 2025)');
    console.log('  ' + '─'.repeat(76));
    for (const p of topProviders) {
        console.log(`     ${p.name} (${p.rut}) — ${Number(p.dte_count)} DTEs — Pendiente: ${fmt(Number(p.pendiente))}`);
    }

    // ── TASA DE CONCILIACIÓN POR MES ──
    console.log('\n\n  📈 TASA DE CONCILIACIÓN POR MES');
    console.log('  ' + '─'.repeat(50));
    for (const tx of txByMonth) {
        const total = Number(tx.total);
        const matched = Number(tx.matched);
        const rate = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';
        const bar = '█'.repeat(Math.round(Number(rate) / 2.5));
        console.log(`  ${tx.mes}  ${rate.padStart(5)}%  ${bar}`);
    }

    // ── RESUMEN GLOBAL ──
    console.log('\n\n  📊 RESUMEN GLOBAL (Dic 2025 → Abr 2026)');
    console.log('  ' + '═'.repeat(50));
    console.log(`     Transacciones: ${txGrandTotal} (${txGrandMatched} matched = ${((txGrandMatched/txGrandTotal)*100).toFixed(1)}%)`);
    console.log(`     DTEs:          ${dteGrandTotal} (${dteGrandPaid} paid, ${dteGrandUnpaid} unpaid)`);
    console.log(`     Matches:       ${mGrandTotal} (${mGrandConf} confirmed, ${mGrandDraft} draft)`);
    console.log('  ' + '═'.repeat(50));

    console.log('\n✅ Reporte completado\n');
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
