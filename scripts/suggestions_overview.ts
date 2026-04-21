import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const suggestions = await prisma.matchSuggestion.findMany({
        where: {
            status: 'PENDING'
        },
        include: {
            transaction: true,
            dte: {
                include: { provider: true }
            }
        }
    });

    console.log(`Total Sugerencias Pendientes: ${suggestions.length}`);
    
    // Group by confidence ranges
    const highConf = suggestions.filter(s => s.confidence >= 0.9);
    const medConf = suggestions.filter(s => s.confidence >= 0.7 && s.confidence < 0.9);
    const lowConf = suggestions.filter(s => s.confidence < 0.7);
    
    console.log(`\n- Confianza Alta (>= 90%): ${highConf.length}`);
    console.log(`- Confianza Media (70% - 89%): ${medConf.length}`);
    console.log(`- Confianza Baja (< 70%): ${lowConf.length}`);
    
    console.log(`\n--- TOP 10 Sugerencias con Alta Confianza ---`);
    for (const s of highConf.slice(0, 10)) {
        console.log(`Score: ${(s.confidence*100).toFixed(0)}% | TX: [${s.transaction.amount}] ${s.transaction.description.substring(0, 30)}... <-> DTE: Folio ${s.dte?.folio} [${s.dte?.totalAmount}] (${s.providerName})`);
    }

    console.log(`\n--- ¿Por qué no se aceptaron automáticamente? ---`);
    console.log(`Muchas pueden tener pequeñas diferencias de fecha (más de 3 días) o el proveedor no es exactamente el mapeado, pero los montos y nombres calzan.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
