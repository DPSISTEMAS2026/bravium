/**
 * Script para limpiar transacciones duplicadas de Fintoc.
 * 
 * Fintoc genera movement_id diferentes para la misma transacción bancaria
 * en distintas sincronizaciones. Esto causa duplicados en la BD.
 * 
 * Estrategia: Agrupar por (bankAccountId + date + amount + description),
 * mantener el más antiguo (createdAt) y eliminar los extras.
 * 
 * USO: node scripts/clean_fintoc_duplicates.js [--dry-run]
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — No se modificarán datos\n' : '⚠️  EJECUCIÓN REAL — Se eliminarán duplicados\n');

  const allTxs = await p.bankTransaction.findMany({
    select: {
      id: true, date: true, amount: true, description: true,
      bankAccountId: true, reference: true, status: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' } // El más viejo primero
  });

  // Agrupar por (cuenta + fecha + monto + descripción)
  const groups = {};
  allTxs.forEach(tx => {
    const key = tx.bankAccountId + '|' + tx.date.toISOString() + '|' + tx.amount + '|' + tx.description;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const dupGroups = Object.entries(groups).filter(([, v]) => v.length > 1);

  console.log(`Total transacciones: ${allTxs.length}`);
  console.log(`Grupos con duplicados: ${dupGroups.length}`);

  let deletedCount = 0;
  let matchesReassigned = 0;
  const errors = [];

  for (const [key, txs] of dupGroups) {
    const [accId, date, amount, desc] = key.split('|');

    // Preferir keeper que ya esté MATCHED (más útil), sino el más viejo
    const sorted = txs.sort((a, b) => {
      if (a.status === 'MATCHED' && b.status !== 'MATCHED') return -1;
      if (b.status === 'MATCHED' && a.status !== 'MATCHED') return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const keeper = sorted[0];
    const extras = sorted.slice(1);

    console.log(`\n📋 ${date.split('T')[0]} $${amount} ${desc.substring(0, 50)}`);
    console.log(`   ✅ Keeper: ${keeper.id.substring(0, 8)} [${keeper.status}] ref:${keeper.reference?.substring(0, 20) || 'null'}`);

    for (const dup of extras) {
      console.log(`   🗑️  Dup:    ${dup.id.substring(0, 8)} [${dup.status}] ref:${dup.reference?.substring(0, 20) || 'null'}`);

      try {
        // Buscar matches que referencien este duplicado
        const matches = await p.reconciliationMatch.findMany({
          where: { transactionId: dup.id }
        });

        if (matches.length > 0) {
          console.log(`      → ${matches.length} match(es) asociado(s)`);

          for (const match of matches) {
            // Verificar si el keeper ya tiene un match para el mismo DTE
            const keeperMatch = await p.reconciliationMatch.findFirst({
              where: { transactionId: keeper.id, dteId: match.dteId }
            });

            if (keeperMatch) {
              // El keeper ya está conciliado con el mismo DTE - eliminar match del dup
              console.log(`      → Match ${match.id.substring(0, 8)} redundante (keeper ya tiene match al mismo DTE). Eliminando match.`);
              if (!DRY_RUN) {
                // Primero eliminar adjustments asociados al match
                await p.balanceAdjustment.deleteMany({ where: { matchId: match.id } });
                await p.reconciliationMatch.delete({ where: { id: match.id } });
              }
            } else {
              // Reasignar el match al keeper
              console.log(`      → Reasignando match ${match.id.substring(0, 8)} al keeper`);
              if (!DRY_RUN) {
                await p.reconciliationMatch.update({
                  where: { id: match.id },
                  data: { transactionId: keeper.id }
                });
                // Asegurar que el keeper quede MATCHED
                if (keeper.status !== 'MATCHED') {
                  await p.bankTransaction.update({
                    where: { id: keeper.id },
                    data: { status: 'MATCHED' }
                  });
                }
                matchesReassigned++;
              }
            }
          }
        }

        // Buscar paymentRecords que referencien al duplicado
        const payRecs = await p.paymentRecord.findMany({
          where: { transactionId: dup.id }
        });
        if (payRecs.length > 0) {
          console.log(`      → ${payRecs.length} paymentRecord(s). Reasignando al keeper.`);
          if (!DRY_RUN) {
            await p.paymentRecord.updateMany({
              where: { transactionId: dup.id },
              data: { transactionId: keeper.id }
            });
          }
        }

        // Eliminar el duplicado
        if (!DRY_RUN) {
          await p.bankTransaction.delete({ where: { id: dup.id } });
        }
        deletedCount++;
        console.log(`      → ${DRY_RUN ? 'Se eliminaría' : 'Eliminado ✅'}`);

      } catch (e) {
        errors.push({ id: dup.id, error: e.message });
        console.log(`      → ❌ Error: ${e.message.substring(0, 100)}`);
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Resultado:`);
  console.log(`  Duplicados eliminados: ${deletedCount}`);
  console.log(`  Matches reasignados: ${matchesReassigned}`);
  console.log(`  Errores: ${errors.length}`);
  if (errors.length > 0) {
    errors.forEach(e => console.log(`    - ${e.id}: ${e.error.substring(0, 60)}`));
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
