import { PrismaClient, TransactionType, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}

async function main() {
    const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
    const apiKey = 'sk_live_6ct1qeB_CSKUY_u3PzJaMuos-Cmt_9qr4VtT39fHykM';
    const linkToken = 'link_J0WLYbi4RwEZXxAB_token_YdkzD6wkjxPwiHrcpmd-8LdS'; // Santander

    console.log("Limpiando extracción reestricta...");
    const oldFintocAccounts = await prisma.bankAccount.findMany({
        where: {
            organizationId: orgId,
            bankName: { contains: '(Fintoc)' }
        }
    });

    for (const acc of oldFintocAccounts) {
        await prisma.bankTransaction.deleteMany({ where: { bankAccountId: acc.id } });
        await prisma.bankAccount.delete({ where: { id: acc.id }});
    }

    console.log("Iniciando extracción Full 2026 (Sin omitir operaciones identicas intra-dia)...");

    const accountsResponse = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${linkToken}`, {
        headers: { 'Authorization': apiKey }
    });
    
    const accounts: any = await accountsResponse.json();
    const account = accounts[0];
    const accId = account.id;
    const bankName = account.institution?.name || 'Santander';

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    const bankAccount = await prisma.bankAccount.create({
        data: {
            bankName: `${bankName} (Fintoc)`,
            accountNumber: account.number || accId,
            currency: account.currency || 'CLP',
            rutHolder: org?.rut || 'N/A',
            organization: { connect: { id: orgId } }
        }
    });

    let nextUrl: string | null = `https://api.fintoc.com/v1/accounts/${accId}/movements?link_token=${linkToken}&since=2026-01-01&per_page=300`;
    let totalCreated = 0;

    while (nextUrl) {
        const response = await fetch(nextUrl, { headers: { 'Authorization': apiKey } });
        const movements = await response.json();

        for (const mov of movements) {
            const externalId = mov.id;
            
            // FintocId Dedup ONLY. Para permitir compras del mismo monto el mismo día.
            const alreadyExists = await prisma.bankTransaction.findFirst({
                where: {
                    bankAccountId: bankAccount.id,
                    metadata: { path: ['fintocId'], equals: externalId }
                }
            });

            if (alreadyExists) continue;

            await prisma.bankTransaction.create({
                data: {
                    bankAccountId: bankAccount.id,
                    amount: mov.amount,
                    description: mov.description || 'Movimiento Fintoc',
                    date: new Date(mov.post_date || mov.created_at),
                    reference: mov.recipient_account?.number || externalId,
                    type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
                    status: 'PENDING',
                    origin: DataOrigin.API_INTEGRATION,
                    metadata: {
                        fintocId: externalId,
                        fintocAccount: accId,
                        syncDate: new Date().toISOString(),
                        raw: mov
                    }
                }
            });
            totalCreated++;
        }

        const linkHeader = response.headers.get('link');
        nextUrl = null;
        if (linkHeader) {
            const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (match) {
                nextUrl = match[1];
                await delay(300); 
            }
        }
    }

    console.log(`✅ Proceso Finalizado. Se guardaron ${totalCreated} movimientos legítimos en total.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
