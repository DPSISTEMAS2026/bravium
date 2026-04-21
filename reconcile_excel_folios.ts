import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';

const prisma = new PrismaClient();

function excelDateToJS(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400 * 1000);
}

async function main() {
    console.log('=== CONCILIAR FACTURAS PENDIENTES CON MOVIMIENTOS BANCARIOS ===\n');

    // 1. DTEs pendientes 2026
    const pendingDtes = await prisma.dTE.findMany({
        where: {
            paymentStatus: { not: 'PAID' },
            issuedDate: { gte: new Date('2026-01-01') },
        }
    });
    const dteByFolio = new Map<number, any>();
    for (const d of pendingDtes) dteByFolio.set(d.folio, d);

    // 2. Leer Excel pestañas mensuales
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    const monthlySheets = ['ENERO 2026', 'FEBRERO 2026', 'MARZO 2026', 'ABRIL 2026'];

    interface ExcelMatch {
        folio: number;
        dte: any;
        sheet: string;
        empresa: string;
        valor: number;
        fechaPago: Date;
    }

    const excelMatches: ExcelMatch[] = [];

    for (const sheetName of monthlySheets) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const data = xlsx.utils.sheet_to_json<any>(sheet, { defval: '' });

        for (const row of data) {
            const keys = Object.keys(row);
            const facturaKey = keys.find(k => {
                const clean = k.toLowerCase().replace(/[\s\xa0]/g, '');
                return clean === 'factura' || clean === 'folio';
            });
            if (!facturaKey) continue;
            const folioVal = Number(row[facturaKey]);
            if (isNaN(folioVal) || folioVal <= 0) continue;

            const dte = dteByFolio.get(folioVal);
            if (!dte) continue;

            const empresa = String(row['Empresa'] || row['Item'] || '');
            const valorKey = keys.find(k => k.toLowerCase().replace(/[\s\xa0]/g, '').includes('valor'));
            let valor = valorKey ? Number(row[valorKey]) || 0 : 0;
            if (!valor) {
                for (const [k, v] of Object.entries(row)) {
                    if (k.trim() === '' && typeof v === 'number' && v > 0) { valor = v; break; }
                }
            }

            const fechaRaw = row['Fecha de Pago'];
            let fechaPago: Date;
            if (typeof fechaRaw === 'number') {
                fechaPago = excelDateToJS(fechaRaw);
            } else {
                continue; // Sin fecha de pago, skip
            }

            excelMatches.push({ folio: folioVal, dte, sheet: sheetName, empresa, valor, fechaPago });
        }
    }

    // Deduplicar por folio (folio 201 aparece 2 veces - tomar la primera)
    const seen = new Set<number>();
    const uniqueMatches = excelMatches.filter(m => {
        if (seen.has(m.folio)) return false;
        seen.add(m.folio);
        return true;
    });

    console.log(`Facturas a conciliar: ${uniqueMatches.length}\n`);

    // 3. Buscar transacciones bancarias y conciliar
    let conciliadas = 0;
    let sinMovimiento = 0;
    let yaMatcheadas = 0;
    let errorCount = 0;

    for (const match of uniqueMatches) {
        const dteAmount = match.dte.totalAmount;
        const excelAmount = match.valor;
        const payDate = match.fechaPago;

        // Buscar transacción por monto negativo cercano a la fecha de pago (±5 días)
        const startDate = new Date(payDate.getTime() - 5 * 86400000);
        const endDate = new Date(payDate.getTime() + 5 * 86400000);

        // Intentar con monto DTE primero, luego con monto Excel
        const amountsToTry = [dteAmount, excelAmount].filter(a => a > 0);
        let foundTx: any = null;

        for (const amt of amountsToTry) {
            // Buscar tanto negativo exacto como con diferencia de ±10
            const candidates = await prisma.bankTransaction.findMany({
                where: {
                    date: { gte: startDate, lte: endDate },
                    amount: { gte: -(amt + 10), lte: -(amt - 10) },
                    status: { in: ['PENDING', 'UNMATCHED'] }
                },
                orderBy: { date: 'asc' }
            });

            if (candidates.length > 0) {
                // Elegir la más cercana en fecha
                const payTime = payDate.getTime();
                candidates.sort((a, b) => 
                    Math.abs(a.date.getTime() - payTime) - Math.abs(b.date.getTime() - payTime)
                );
                foundTx = candidates[0];
                break;
            }
        }

        if (!foundTx) {
            // Intentar buscar en MATCHED también (ya conciliada con otro DTE?)
            const matchedCandidates = await prisma.bankTransaction.findMany({
                where: {
                    date: { gte: startDate, lte: endDate },
                    amount: { gte: -(dteAmount + 10), lte: -(dteAmount - 10) },
                    status: 'MATCHED'
                }
            });
            if (matchedCandidates.length > 0) {
                console.log(`  ⚠️ Folio ${match.folio} ($${dteAmount.toLocaleString('es-CL')}) - Tx ya MATCHED el ${matchedCandidates[0].date.toISOString().split('T')[0]}`);
                yaMatcheadas++;
                continue;
            }

            console.log(`  ❌ Folio ${match.folio} ($${dteAmount.toLocaleString('es-CL')}) - Sin movimiento bancario (pago Excel: ${payDate.toISOString().split('T')[0]})`);
            sinMovimiento++;
            continue;
        }

        // Verificar que el DTE no tenga ya un match confirmado
        const existingMatch = await prisma.reconciliationMatch.findFirst({
            where: { dteId: match.dte.id, status: 'CONFIRMED' }
        });
        if (existingMatch) {
            console.log(`  ⚠️ Folio ${match.folio} ya tiene match confirmado, se omite`);
            yaMatcheadas++;
            continue;
        }

        // Verificar que la transacción no tenga ya match confirmado con OTRO DTE
        const txExistingMatch = await prisma.reconciliationMatch.findFirst({
            where: { transactionId: foundTx.id, status: 'CONFIRMED' }
        });
        if (txExistingMatch) {
            console.log(`  ⚠️ Folio ${match.folio} - Tx ${foundTx.date.toISOString().split('T')[0]} ya conciliada con otro DTE`);
            yaMatcheadas++;
            continue;
        }

        // Crear match
        try {
            await prisma.reconciliationMatch.create({
                data: {
                    transactionId: foundTx.id,
                    dteId: match.dte.id,
                    status: 'CONFIRMED',
                    confidence: 1.0,
                    origin: 'MANUAL',
                    notes: `Conciliado via Excel [${match.sheet}] - ${match.empresa}`,
                    confirmedAt: new Date(),
                    confirmedBy: 'EXCEL_RECONCILE',
                    ruleApplied: 'ExcelFolioMatch'
                }
            });

            // Actualizar transacción a MATCHED
            await prisma.bankTransaction.update({
                where: { id: foundTx.id },
                data: { status: 'MATCHED' }
            });

            // Actualizar DTE a PAID
            await prisma.dTE.update({
                where: { id: match.dte.id },
                data: { paymentStatus: 'PAID' }
            });

            const daysDiff = Math.abs(foundTx.date.getTime() - payDate.getTime()) / 86400000;
            conciliadas++;
            console.log(`  ✅ Folio ${match.folio} ($${dteAmount.toLocaleString('es-CL')}) → Tx ${foundTx.date.toISOString().split('T')[0]} "${foundTx.description}" (${daysDiff.toFixed(0)}d) [${match.sheet}]`);
        } catch (e: any) {
            console.log(`  ❌ Error folio ${match.folio}: ${e.message}`);
            errorCount++;
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  Conciliadas: ${conciliadas}`);
    console.log(`  Ya matcheadas: ${yaMatcheadas}`);
    console.log(`  Sin movimiento bancario: ${sinMovimiento}`);
    console.log(`  Errores: ${errorCount}`);

    const finalPending = await prisma.bankTransaction.count({ where: { status: 'PENDING' } });
    const finalUnmatched = await prisma.bankTransaction.count({ where: { status: 'UNMATCHED' } });
    const finalMatched = await prisma.bankTransaction.count({ where: { status: 'MATCHED' } });
    const dtePaid = await prisma.dTE.count({ where: { paymentStatus: 'PAID', issuedDate: { gte: new Date('2026-01-01') } } });
    const dtePending = await prisma.dTE.count({ where: { paymentStatus: { not: 'PAID' }, issuedDate: { gte: new Date('2026-01-01') } } });

    console.log(`\n  Transacciones: ${finalPending} PENDING, ${finalUnmatched} UNMATCHED, ${finalMatched} MATCHED`);
    console.log(`  DTEs 2026: ${dtePaid} PAID, ${dtePending} pendientes`);

    await prisma.$disconnect();
}
main().catch(console.error);
