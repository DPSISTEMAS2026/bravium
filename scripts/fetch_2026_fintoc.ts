import { PrismaClient, TransactionType, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}

async function main() {
    const orgId = '2ed2f67d-b9f0-42d9-afd1-2c71522fb61d'; // DP Sistemas
    const apiKey = 'sk_live_6ct1qeB_CSKUY_u3PzJaMuos-Cmt_9qr4VtT39fHykM';
    const linkToken = 'link_J0WLYbi4RwEZXxAB_token_YdkzD6wkjxPwiHrcpmd-8LdS'; // Santander

    console.log("Iniciando extracción Full 2026 para Santander...");

    const accountsResponse = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${linkToken}`, {
        headers: { 'Authorization': apiKey }
    });
    
    if (!accountsResponse.ok) {
        console.error("No se pudo acceder a las cuentas:", await accountsResponse.text());
        return;
    }

    const accounts: any = await accountsResponse.json();
    if (accounts.length === 0) {
        console.log("No se encontraron cuentas bancarias para ese token.");
        return;
    }

    const account = accounts[0];
    const accId = account.id;
    const bankName = account.institution?.name || 'Santander';

    let bankAccount = await prisma.bankAccount.findFirst({
        where: { 
            organizationId: orgId,
            accountNumber: account.number || accId
        }
    });

    if (!bankAccount) {
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        bankAccount = await prisma.bankAccount.create({
            data: {
                bankName: `${bankName} (Fintoc)`,
                accountNumber: account.number || accId,
                currency: account.currency || 'CLP',
                rutHolder: org?.rut || 'N/A',
                organization: { connect: { id: orgId } }
            }
        });
    }

    // Paginación desde Enero 2026
    let nextUrl: string | null = `https://api.fintoc.com/v1/accounts/${accId}/movements?link_token=${linkToken}&since=2026-01-01&per_page=300`;
    let totalCreated = 0;
    let totalExisting = 0;

    console.log(`Descargando movimientos para la cuenta ${accId}...`);

    while (nextUrl) {
        console.log(`-> Fetching page: ${nextUrl}`);
        const response = await fetch(nextUrl, { headers: { 'Authorization': apiKey } });
        if (!response.ok) {
            console.error("Error obteniendo movimientos", response.status, await response.text());
            break;
        }

        const movements = await response.json();
        console.log(`Se obtuvieron ${movements.length} movimientos de esta página.`);

        for (const mov of movements) {
            const externalId = mov.id;
            const movDateLocal = new Date(mov.post_date || mov.created_at);
            
            const startOfDay = new Date(movDateLocal);
            startOfDay.setUTCHours(0,0,0,0);
            const endOfDay = new Date(movDateLocal);
            endOfDay.setUTCHours(23,59,59,999);

            const alreadyExists = await prisma.bankTransaction.findFirst({
                where: {
                    bankAccountId: bankAccount.id,
                    OR: [
                        { metadata: { path: ['fintocId'], equals: externalId } },
                        { 
                            amount: mov.amount,
                            type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
                            date: { gte: startOfDay, lte: endOfDay }
                        }
                    ]
                }
            });

            if (alreadyExists) {
                totalExisting++;
                continue;
            }

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
                // Respetar limites
                await delay(1000); 
            }
        }
    }

    console.log(`\n✅ Proceso Finalizado. Se guardaron ${totalCreated} nuevos; se ignoraron ${totalExisting} ya existentes.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
