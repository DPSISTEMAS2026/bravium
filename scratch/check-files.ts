import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const result = await p.$queryRawUnsafe(`
        SELECT bt.metadata->>'sourceFile' as file, count(*) 
        FROM bank_transactions bt 
        JOIN bank_accounts ba ON ba.id = bt."bankAccountId" 
        WHERE ba."organizationId" = $1 
        GROUP BY 1
    `, orgId);
    console.log(JSON.stringify(result, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
