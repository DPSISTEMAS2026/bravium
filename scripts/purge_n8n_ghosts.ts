import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- BARRIDO DE CARGAS FANTASMA N8N Y LEGACY 2026 ---");

    const ghosts = await prisma.bankTransaction.findMany({
        where: {
            date: { gte: new Date('2026-01-01') },
            status: 'PENDING',
            OR: [
                { origin: 'N8N_AUTOMATION' },
                { bankAccount: { accountNumber: '0-000-9219882-0' } },
                { bankAccount: { bankName: { contains: 'Drive Import' } } }
            ]
        },
        select: { id: true }
    });
    
    const ghostIds = ghosts.map(g => g.id);
    
    if (ghostIds.length > 0) {
        // First delete any dangling draft matches attached to these ghosts
        const delMatches = await prisma.reconciliationMatch.deleteMany({
            where: { transactionId: { in: ghostIds } }
        });
        console.log(`Borrados ${delMatches.count} matches basura (draft/reject) asociados a los fantasmas.`);
        
        // Now safe to delete
        const deleteTxs = await prisma.bankTransaction.deleteMany({
            where: { id: { in: ghostIds } }
        });
        console.log(`PULVERIZADOS: ${deleteTxs.count} movimientos bancarios (Ghosts) exitosamente eliminados.`);
    } else {
        console.log("No ghosts found.");
    }

    // Optionally sweep old empty BankAccounts connected to n8n if they have no txs
    const oldAccount = await prisma.bankAccount.findFirst({
        where: { accountNumber: '0-000-9219882-0' }
    });
    
    if (oldAccount) {
        // Can we delete it? Let's check remaining txs
        const remaining = await prisma.bankTransaction.count({
            where: { bankAccountId: oldAccount.id }
        });
        if (remaining === 0) {
            await prisma.bankAccount.delete({ where: { id: oldAccount.id } });
            console.log("-> Cuenta bancaria legacy '0-000-9219882-0' fue eliminada de los registros por inactividad.");
        } else {
            // mark internal / archive
            await prisma.bankAccount.update({
                where: { id: oldAccount.id },
                data: { isActive: false }
            });
            console.log(`-> Cuenta bancaria legacy '0-000-9219882-0' fue desactivada (todavía tiene ${remaining} txs historicas previas a 2026).`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
