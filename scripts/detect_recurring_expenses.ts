import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- AUDITORÍA DE MOVIMIENTOS RECURRENTES (GASTOS COMUNES, ETC) ---\n");

    // Fetch all pending transactions
    const txs = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            status: 'PENDING',
            type: 'DEBIT' // Usually expenses are debits (egress)
        }
    });

    // Group by normalized description and amount (or similar amount ranges)
    const groups: Record<string, { count: number, totalAmount: number, sampleDates: string[], sampleAmounts: Set<number>, names: Set<string> }> = {};

    for (const tx of txs) {
        // Normalize: remove generic prefixes like 'PAGO AUTOMATICO', 'CARGO EN CUENTA', or leading zeros/dates
        let norm = tx.description.toUpperCase().replace(/\s+/g, ' ').trim();
        norm = norm.replace(/^(PAGO AUTOMATICO|CARGO EN CUENTA|PAGO PROVEEDOR|TRANSF\.? INTERNET|TRANSF\.? A|CARGO AUTOMATICO)\s*/g, '');
        norm = norm.replace(/\b(DE|A|EN|EL|LA|LOS|LAS)\b/g, '').trim();
        
        // Also strip numbers at start or end that might be folio numbers varying 
        norm = norm.replace(/\d+/g, '').replace(/[^A-Z ]/g, '').trim();

        if (norm.length < 3) continue; // Skip too short

        if (!groups[norm]) {
            groups[norm] = { count: 0, totalAmount: 0, sampleDates: [], sampleAmounts: new Set(), names: new Set() };
        }
        groups[norm].count++;
        groups[norm].totalAmount += tx.amount;
        if (groups[norm].sampleDates.length < 5) groups[norm].sampleDates.push(tx.date.toISOString().split('T')[0]);
        groups[norm].sampleAmounts.add(Math.abs(tx.amount));
        groups[norm].names.add(tx.description.trim());
    }

    const recurring = Object.values(groups)
        .filter(g => g.count >= 2) // Happens at least twice
        .sort((a, b) => b.count - a.count);

    if (recurring.length === 0) {
        console.log("No se encontraron gastos recurrentes no conciliados.");
    } else {
        console.log(`Encontrados ${recurring.length} patrones de gasto repetitivos:\n`);
        recurring.slice(0, 15).forEach((g, i) => {
            const amountDesc = g.sampleAmounts.size > 1 ? 'Montos variables' : `Monto Fijo: ${Array.from(g.sampleAmounts)[0]}`;
            console.log(`${i+1}. Patron: [${Array.from(g.names)[0]}]`);
            console.log(`   - Repeticiones: ${g.count} veces pendientes`);
            console.log(`   - Fechas aprox: ${g.sampleDates.join(', ')}`);
            console.log(`   - Característica: ${amountDesc} (Promedio: ${Math.round(Math.abs(g.totalAmount) / g.count)})\n`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
