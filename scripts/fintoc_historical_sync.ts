import { PrismaClient, TransactionType, TransactionStatus, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();

const SINCE_DATE = '2025-12-01';

async function main() {
  console.log(`--- EXTRACCIÓN HISTÓRICA FINTOC DESDE ${SINCE_DATE} ---`);

  const org = await prisma.organization.findFirst({ 
    where: { isActive: true, fintocApiKey: { not: null } } 
  });
  if (!org || !org.fintocApiKey) throw new Error("No se encontró Organización con Fintoc.");
  console.log(`Organización: ${org.name}`);

  const apiKey = org.fintocApiKey;

  // Hay múltiples link tokens separados por coma
  const linkTokens = (org.fintocLinkToken || '').split(',').map(t => t.trim()).filter(Boolean);
  console.log(`Link tokens encontrados: ${linkTokens.length}`);

  if (linkTokens.length === 0) {
    console.log('No hay link tokens configurados. Intentando descubrir links...');
    const linksRes = await fetch('https://api.fintoc.com/v1/links', { headers: { 'Authorization': apiKey } });
    const linksData: any = await linksRes.json();
    console.log('Links descubiertos:', JSON.stringify(linksData).slice(0, 300));
    return;
  }

  let totalDescargados = 0;

  for (const linkToken of linkTokens) {
    console.log(`\n=== Procesando link: ${linkToken.slice(0, 20)}... ===`);

    // Obtener cuentas de este link
    const accRes = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${linkToken}`, {
      headers: { 'Authorization': apiKey }
    });

    if (!accRes.ok) {
      const errText = await accRes.text();
      console.error(`Error obteniendo cuentas: ${accRes.status} - ${errText.slice(0, 200)}`);
      continue;
    }

    const accountsRaw: any = await accRes.json();
    const accounts: any[] = Array.isArray(accountsRaw) ? accountsRaw : [accountsRaw];

    for (const acc of accounts) {
      if (!acc.id) continue;
      const accId = acc.id;
      const bankName = acc.institution?.name || 'Fintoc Bank';
      const accNumber = acc.number || accId;
      console.log(`\n  Cuenta: ${accNumber} (${bankName}) - Tipo: ${acc.type || 'N/A'}`);

      // Buscar o crear cuenta bancaria local
      let bankAccount = await prisma.bankAccount.findFirst({
        where: { accountNumber: accNumber, organizationId: org.id }
      });

      if (!bankAccount) {
        bankAccount = await prisma.bankAccount.create({
          data: {
            bankName: `${bankName} (Fintoc)`,
            accountNumber: accNumber,
            currency: acc.currency || 'CLP',
            rutHolder: org.rut,
            organizationId: org.id
          }
        });
        console.log(`  -> Cuenta creada en BD: ${bankAccount.id}`);
      } else {
        console.log(`  -> Cuenta ya existe en BD: ${bankAccount.id}`);
      }

      // Paginar movimientos con since
      let allMovements: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          link_token: linkToken,
          since: SINCE_DATE,
          per_page: '300',
          page: String(page)
        });

        const movRes = await fetch(`https://api.fintoc.com/v1/accounts/${accId}/movements?${params}`, {
          headers: { 'Authorization': apiKey }
        });

        if (!movRes.ok) {
          const errText = await movRes.text();
          console.error(`  Error movimientos página ${page}: ${movRes.status} - ${errText.slice(0, 200)}`);
          break;
        }

        const movements: any = await movRes.json();
        const movArray = Array.isArray(movements) ? movements : (movements?.results || []);

        if (movArray.length === 0) {
          hasMore = false;
        } else {
          allMovements = allMovements.concat(movArray);
          console.log(`  Página ${page}: ${movArray.length} movimientos (acumulado: ${allMovements.length})`);
          page++;
          // Safety: si la página devolvió menos del máximo, no hay más
          if (movArray.length < 300) hasMore = false;
        }
      }

      console.log(`  Total movimientos de Fintoc: ${allMovements.length}`);

      const txsData = allMovements.map(mov => {
        let finalDate = new Date(mov.post_date || mov.created_at);
        if (mov.post_date?.includes('T00:00:00Z')) {
          finalDate.setUTCHours(12, 0, 0, 0);
        }
        return {
            bankAccountId: bankAccount.id,
            amount: mov.amount,
            description: mov.description || 'Movimiento Fintoc',
            date: finalDate,
            reference: mov.recipient_account?.number || mov.id,
            type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
            status: TransactionStatus.PENDING,
            origin: DataOrigin.API_INTEGRATION,
            metadata: {
              fintocId: mov.id,
              fintocAccount: accId,
              syncDate: new Date().toISOString(),
              isHistoricalLoad: true,
            }
        };
      });

      // Insertar en bulto (bulk insert), ignorando errores de llave única si las hubiera (al requerir skipDuplicates en providers que lo soporten)
      // Como acabamos de purgar, no debería haber duplicados locales para la misma carga.
      // Filtramos duplicados en memoria usando el ID de Fintoc por si Fintoc nos mandó el mismo ID en distintas páginas.
      const uniqueTxsData = [];
      const seenFintocIds = new Set();
      for (const t of txsData) {
         if (!seenFintocIds.has(t.metadata.fintocId)) {
             seenFintocIds.add(t.metadata.fintocId);
             uniqueTxsData.push(t);
         }
      }

      await prisma.bankTransaction.createMany({
         data: uniqueTxsData,
         skipDuplicates: true
      });

      console.log(`  -> Batch insertados: ${uniqueTxsData.length} (Original de Fintoc: ${allMovements.length})`);
      totalDescargados += uniqueTxsData.length;
    }
  }

  console.log(`\n--- SINCRONIZACIÓN FINALIZADA. TOTAL DESCARGADO: ${totalDescargados} ---`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
