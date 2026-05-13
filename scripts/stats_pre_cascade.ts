import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const [pending, matched, partial, drafts, confirmed, unpaid, withRut] = await Promise.all([
    p.bankTransaction.count({ where: { status: 'PENDING' } }),
    p.bankTransaction.count({ where: { status: 'MATCHED' } }),
    p.bankTransaction.count({ where: { status: 'PARTIALLY_MATCHED' } }),
    p.reconciliationMatch.count({ where: { status: 'DRAFT' } }),
    p.reconciliationMatch.count({ where: { status: 'CONFIRMED' } }),
    p.dTE.count({ where: { paymentStatus: 'UNPAID' } }),
    p.bankTransaction.count({ where: { metadata: { path: ['providerRut'], not: null } } }),
  ]);
  console.log('=== STATS PRE-CASCADE ===');
  console.log('TX PENDING:          ', pending);
  console.log('TX MATCHED:          ', matched);
  console.log('TX PARTIAL:          ', partial);
  console.log('DRAFT matches:       ', drafts);
  console.log('CONFIRMED matches:   ', confirmed);
  console.log('DTEs UNPAID:         ', unpaid);
  console.log('TXs con providerRut: ', withRut);
}
main().catch(console.error).finally(() => p.$disconnect());
