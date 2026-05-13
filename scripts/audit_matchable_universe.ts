/**
 * audit_matchable_universe.ts
 * Responde: ¿Cuántas TXs SON realmente conciliables con algún DTE?
 * Separa: nómina, PREVIRED, tarjeta, divisas, transferencias a proveedor.
 */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function extractRutFromDesc(desc: string): string | null {
    // Formato 1: XX.XXX.XXX-K
    const m1 = desc.match(/(\d{1,2}[\.\d]*\d-[\dkK])/);
    if (m1) return m1[1].replace(/\./g, '');
    // Formato 2: 0XXXXXXXX al inicio
    const m2 = desc.match(/^0(\d{7,8})(\d)/);
    if (m2) return `${m2[1]}-${m2[2]}`;
    return null;
}

// Categorías de TXs que nunca van a tener DTE de proveedor
const NO_DTE_PATTERNS = [
    /remuneraci[oó]n/i,
    /previred/i,
    /egreso.*divisa/i,
    /compra.*divisa/i,
    /mercado.*capital/i,
    /cargo.*mercado/i,
    /iva com\. remuneraci/i,
    /comision remuneraci/i,
    /envio.*transferencia.*internacional/i,
    /transferencia.*internacional/i,
    /cobro.*vvista/i,
    /prepago.*cuotas/i,
    /cuota.*credito/i,
];

async function main() {
    const org = await p.organization.findFirst({ where: { isActive: true } });
    const orgId = org!.id;
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 180);

    const txs = await p.bankTransaction.findMany({
        where: {
            status: { in: ['PENDING', 'PARTIALLY_MATCHED', 'UNMATCHED'] },
            type: 'DEBIT',
            date: { gte: lookbackDate },
            bankAccount: { organizationId: orgId },
        },
        select: { id: true, amount: true, date: true, description: true, metadata: true, status: true },
        orderBy: { date: 'asc' }
    });

    const dtes = await p.dTE.findMany({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, organizationId: orgId, type: { not: 61 } },
        select: { id: true, totalAmount: true, rutIssuer: true, providerId: true,
            provider: { select: { id: true, name: true, rut: true } } }
    });

    // Índice de DTEs por monto y por RUT emisor
    const dteByAmt = new Map<number, typeof dtes>();
    const dteByRut = new Map<string, typeof dtes>();
    for (const d of dtes) {
        const amt = d.totalAmount;
        if (!dteByAmt.has(amt)) dteByAmt.set(amt, []);
        dteByAmt.get(amt)!.push(d);

        const rut = (d.provider?.rut || d.rutIssuer || '').replace(/\./g, '').toLowerCase();
        if (rut && !rut.startsWith('auto-')) {
            if (!dteByRut.has(rut)) dteByRut.set(rut, []);
            dteByRut.get(rut)!.push(d);
        }
    }

    // Clasificar cada TX
    const cats = {
        noDte: [] as any[],          // nomina/PREVIRED/divisas
        withRutMatch: [] as any[],   // TX tiene RUT → DTE del mismo proveedor
        withAmtMatch: [] as any[],   // TX tiene monto exacto en algún DTE
        tarjeta: [] as any[],        // compra tarjeta/webpay sin RUT claro
        unknown: [] as any[],        // no categorizable
    };

    for (const tx of txs) {
        const desc = tx.description || '';
        const amt = Math.abs(tx.amount);

        // ¿Es pago sin DTE posible?
        if (NO_DTE_PATTERNS.some(r => r.test(desc))) {
            cats.noDte.push({ ...tx, _reason: 'nómina/PREVIRED/divisas' });
            continue;
        }

        // ¿Tiene RUT en descripción o metadata?
        const metaRut = (tx.metadata as any)?.providerRut;
        const descRut = extractRutFromDesc(desc);
        const rut = ((metaRut || descRut) as string | null)?.replace(/\./g, '').toLowerCase();

        if (rut) {
            const dtesByRut = dteByRut.get(rut) || dteByRut.get(rut.replace(/-/g, '')) || [];
            cats.withRutMatch.push({ ...tx, _rut: rut, _dtesForRut: dtesByRut.length });
            continue;
        }

        // ¿Tiene monto exacto?
        if (dteByAmt.has(amt)) {
            cats.withAmtMatch.push({ ...tx, _dtes: dteByAmt.get(amt)!.length });
            continue;
        }

        // ¿Parece tarjeta/web?
        if (/compra nacional|webpay|dp \*|mp \*/i.test(desc)) {
            cats.tarjeta.push(tx);
            continue;
        }

        cats.unknown.push(tx);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  UNIVERSO REAL DE CONCILIACIÓN`);
    console.log(`  Total TXs PENDING/UNMATCHED (180d): ${txs.length}`);
    console.log(`  DTEs UNPAID/PARTIAL disponibles:    ${dtes.length}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`🚫 Sin DTE posible (nómina/PREVIRED/divisas): ${cats.noDte.length}`);
    console.log(`   → No son conciliables. Deberían marcarse como "Gasto operativo"`);
    
    console.log(`\n✅ Con RUT identificado (transferencias a proveedor): ${cats.withRutMatch.length}`);
    const sinDte = cats.withRutMatch.filter(t => t._dtesForRut === 0);
    const conDte = cats.withRutMatch.filter(t => t._dtesForRut > 0);
    console.log(`   Con DTE del mismo RUT disponible: ${conDte.length}`);
    console.log(`   Sin DTE del mismo RUT (proveedor sin factura pendiente): ${sinDte.length}`);
    if (sinDte.length > 0) {
        console.log(`   Ejemplos sin DTE:`);
        for (const t of sinDte.slice(0, 8))
            console.log(`     $${Math.abs(t.amount).toLocaleString('es-CL')} | ${t.date.toISOString().slice(0,10)} | ${t.description?.slice(0,50)} | RUT: ${t._rut}`);
    }
    
    console.log(`\n💡 Con monto exacto en algún DTE (sin RUT): ${cats.withAmtMatch.length}`);
    
    console.log(`\n💳 Tarjeta/WebPay/MP (pago de múltiples facturas): ${cats.tarjeta.length}`);
    console.log(`   → Requieren match SUM manual (un pago cubre N facturas)`);
    
    console.log(`\n❓ Sin categoría clara: ${cats.unknown.length}`);
    if (cats.unknown.length > 0) {
        for (const t of cats.unknown.slice(0, 10))
            console.log(`     $${Math.abs(t.amount).toLocaleString('es-CL')} | ${t.date.toISOString().slice(0,10)} | ${t.description?.slice(0,55)}`);
    }

    const totalMatchable = cats.withRutMatch.length + cats.withAmtMatch.length + cats.tarjeta.length + cats.unknown.length;
    const autoMatchable = conDte.length + cats.withAmtMatch.length;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Teóricamente matchables: ${totalMatchable} (excluye nómina/PREVIRED)`);
    console.log(`  Auto-matchables HOY:     ${autoMatchable} (RUT con DTE + monto exacto)`);
    console.log(`  Tasa teórica máxima:     ${Math.round(autoMatchable/txs.length*100)}% de todas las TXs`);
    console.log(`  (Tarjeta+unknown requieren SUM o matching manual)`);
    console.log(`${'─'.repeat(60)}\n`);

    // RUTs que tienen TXs pero cero DTEs
    console.log(`RUTs con transferencias pero sin DTE pendiente:`);
    const rutSinDte: Record<string, number> = {};
    for (const t of sinDte) {
        rutSinDte[t._rut] = (rutSinDte[t._rut] || 0) + 1;
    }
    for (const [rut, cnt] of Object.entries(rutSinDte).sort((a,b) => b[1]-a[1])) {
        console.log(`  RUT ${rut} → ${cnt} TXs sin DTE`);
    }
}

main().catch(console.error).finally(() => p.$disconnect());
