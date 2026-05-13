import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ORG = '715545b8-4522-4bb1-be81-3047546c0e8c';

async function main() {
  const accs = await p.bankAccount.findMany({ where: { organizationId: ORG }, select: { id: true, bankName: true, accountNumber: true }});
  console.log('TASA DE CONCILIACIÓN POR CUENTA BANCARIA:');
  console.log('─'.repeat(70));
  for (const a of accs) {
    const total = await p.bankTransaction.count({ where: { bankAccountId: a.id }});
    const matched = await p.bankTransaction.count({ where: { bankAccountId: a.id, status: 'MATCHED' }});
    const partial = await p.bankTransaction.count({ where: { bankAccountId: a.id, status: 'PARTIALLY_MATCHED' }});
    const pending = await p.bankTransaction.count({ where: { bankAccountId: a.id, status: 'PENDING' }});
    if (total === 0) continue;
    const rate = ((matched/total)*100).toFixed(1);
    const combinedRate = (((matched + partial)/total)*100).toFixed(1);
    console.log(`  ${a.bankName} (${a.accountNumber}):`);
    console.log(`    Total: ${total} | Matched: ${matched} (${rate}%) | Partial: ${partial} | Pending: ${pending}`);
    console.log(`    Tasa combinada (match+partial): ${combinedRate}%`);
    console.log('');
  }
}
main().catch(console.error).finally(() => p.$disconnect());
