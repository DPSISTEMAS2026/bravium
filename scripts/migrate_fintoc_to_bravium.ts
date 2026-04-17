import { PrismaClient, TransactionType, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const braviumOrgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const dpOrgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d';
    const targetAccountId = 'acc-santander-9219882-0'; // Bravium Santander CC

    console.log("🚀 MIGRACIÓN: Fintoc (DP) → Bravium Santander CC\n");

    // 1. Cargar todos los datos
    const fintocTxs = await prisma.bankTransaction.findMany({
        where: {
            origin: 'API_INTEGRATION',
            bankAccount: { organizationId: dpOrgId, accountNumber: '92198820' }
        },
        orderBy: { date: 'asc' }
    });

    const manualTxs = await prisma.bankTransaction.findMany({
        where: { bankAccountId: targetAccountId },
        orderBy: { date: 'asc' }
    });

    const allMatches = await prisma.reconciliationMatch.findMany({
        where: { transactionId: { in: manualTxs.map(t => t.id) } }
    });

    // Indexar matches por transactionId
    const matchesByTxId = new Map<string, typeof allMatches>();
    allMatches.forEach(m => {
        const arr = matchesByTxId.get(m.transactionId) || [];
        arr.push(m);
        matchesByTxId.set(m.transactionId, arr);
    });

    console.log(`📊 Fintoc: ${fintocTxs.length} | Manual: ${manualTxs.length} | Matches: ${allMatches.length}`);

    // 2. FASE 1: Insertar los 605 movimientos de Fintoc en Bravium
    console.log("\n--- FASE 1: Insertando movimientos Fintoc en Bravium ---");
    const newTxMap = new Map<string, string>(); // fintocId -> newBraviumTxId

    for (const ftx of fintocTxs) {
        const fintocId = (ftx.metadata as any)?.fintocId;

        const newTx = await prisma.bankTransaction.create({
            data: {
                bankAccountId: targetAccountId,
                amount: ftx.amount,
                description: ftx.description,
                date: ftx.date,
                reference: ftx.reference,
                type: ftx.type,
                status: ftx.status,
                origin: DataOrigin.API_INTEGRATION,
                metadata: ftx.metadata as any
            }
        });

        if (fintocId) newTxMap.set(fintocId, newTx.id);
    }
    console.log(`✅ ${newTxMap.size} transacciones Fintoc insertadas en Bravium`);

    // 3. FASE 2: Transferir matches de conciliación
    console.log("\n--- FASE 2: Transfiriendo matches de conciliación ---");
    let transferidos = 0;
    let ambiguos = 0;
    let sinMatch = 0;
    const manualTxsToDelete: string[] = [];
    const usedFintocNewIds = new Set<string>();

    for (const mtx of manualTxs) {
        const txMatches = matchesByTxId.get(mtx.id);
        if (!txMatches || txMatches.length === 0) continue; // Sin match, no hay nada que transferir

        // Buscar equivalente Fintoc: mismo monto + fecha ±1 día
        const mtxDate = mtx.date.getTime();
        const candidates = fintocTxs.filter(ftx => {
            const fid = (ftx.metadata as any)?.fintocId;
            const newId = fid ? newTxMap.get(fid) : null;
            if (!newId || usedFintocNewIds.has(newId)) return false; // ya fue usado

            const dateDiff = Math.abs(ftx.date.getTime() - mtxDate);
            const oneDayMs = 24 * 60 * 60 * 1000;
            return ftx.amount === mtx.amount && dateDiff <= oneDayMs;
        });

        if (candidates.length === 1) {
            // Match único e inequívoco → transferir
            const fintocId = (candidates[0].metadata as any)?.fintocId;
            const newBraviumId = newTxMap.get(fintocId)!;

            for (const match of txMatches) {
                await prisma.reconciliationMatch.update({
                    where: { id: match.id },
                    data: { transactionId: newBraviumId }
                });
            }

            usedFintocNewIds.add(newBraviumId);
            manualTxsToDelete.push(mtx.id);
            transferidos++;
        } else if (candidates.length > 1) {
            ambiguos++;
            // NO tocamos este match — se queda en la transacción manual original
        } else {
            sinMatch++;
            // No hay equivalente Fintoc — se queda en la transacción manual
        }
    }

    console.log(`✅ Matches transferidos exitosamente: ${transferidos}`);
    console.log(`⚠️ Matches ambiguos (conservados en manual): ${ambiguos}`);
    console.log(`🔒 Matches sin equivalente Fintoc (conservados): ${sinMatch}`);

    // 4. FASE 3: Eliminar transacciones manuales reemplazadas
    console.log("\n--- FASE 3: Limpieza de transacciones manuales reemplazadas ---");

    // Manuales SIN match que sí tienen equivalente Fintoc (se pueden borrar seguro)
    const manualWithoutMatch = manualTxs.filter(t => 
        !matchesByTxId.has(t.id) || matchesByTxId.get(t.id)!.length === 0
    );

    // De estas, buscar cuáles tienen equivalente Fintoc para evitar duplicados
    for (const mtx of manualWithoutMatch) {
        const mtxDate = mtx.date.getTime();
        const hasFintocEquiv = fintocTxs.some(ftx => {
            const dateDiff = Math.abs(ftx.date.getTime() - mtxDate);
            return ftx.amount === mtx.amount && dateDiff <= 24 * 60 * 60 * 1000;
        });
        if (hasFintocEquiv) {
            manualTxsToDelete.push(mtx.id);
        }
    }

    if (manualTxsToDelete.length > 0) {
        await prisma.bankTransaction.deleteMany({
            where: { id: { in: manualTxsToDelete } }
        });
    }

    console.log(`🗑️ ${manualTxsToDelete.length} transacciones manuales eliminadas (reemplazadas por Fintoc)`);

    // Contar lo que queda
    const remaining = manualTxs.length - manualTxsToDelete.length;
    console.log(`📌 ${remaining} transacciones manuales conservadas (ambiguas o sin equivalente)`);

    // 5. Conteo final
    const finalCount = await prisma.bankTransaction.count({
        where: { bankAccountId: targetAccountId }
    });
    const finalMatches = await prisma.reconciliationMatch.count({
        where: { transaction: { bankAccountId: targetAccountId } }
    });

    console.log(`\n========== RESULTADO FINAL ==========`);
    console.log(`📊 Total movimientos en Santander CC Bravium: ${finalCount}`);
    console.log(`🔗 Total matches de conciliación preservados: ${finalMatches}`);
    console.log(`=====================================`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
