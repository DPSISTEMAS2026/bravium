/**
 * fintoc_incremental_sync.ts
 * 
 * Extrae movimientos de Fintoc desde la última sincronización hasta hoy.
 * Detecta automáticamente la fecha del último movimiento importado y baja
 * solo lo nuevo, con deduplicación por fintocId y por contenido.
 * 
 * Uso: npx ts-node scripts/fintoc_incremental_sync.ts [--dry-run]
 */

import { PrismaClient, TransactionType, TransactionStatus, DataOrigin } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  FINTOC INCREMENTAL SYNC ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
  console.log(`  Fecha: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Obtener la organización con Fintoc configurado
  const org = await prisma.organization.findFirst({
    where: { isActive: true, fintocApiKey: { not: null } }
  });

  if (!org || !org.fintocApiKey) {
    throw new Error('No se encontró Organización activa con Fintoc configurado.');
  }

  console.log(`📌 Organización: ${org.name} (${org.slug})`);

  const apiKey = org.fintocApiKey;
  const linkTokens = (org.fintocLinkToken || '').split(',').map(t => t.trim()).filter(Boolean);

  if (linkTokens.length === 0) {
    console.log('⚠️  No hay link tokens configurados. Intentando descubrir links...');
    const linksRes = await fetch('https://api.fintoc.com/v1/links', { headers: { 'Authorization': apiKey } });
    const linksData: any = await linksRes.json();
    console.log('Links descubiertos:', JSON.stringify(linksData, null, 2));
    return;
  }

  console.log(`🔑 Link tokens: ${linkTokens.length}`);

  // 2. Encontrar la fecha del último movimiento Fintoc importado
  const lastFintocTx = await prisma.bankTransaction.findFirst({
    where: {
      origin: DataOrigin.API_INTEGRATION,
      metadata: { not: undefined },
    },
    orderBy: { date: 'desc' },
  });

  let sinceDate: string;

  if (lastFintocTx) {
    // Restamos 1 día para cubrir posibles movimientos del mismo día que no entraron
    const lastDate = new Date(lastFintocTx.date);
    lastDate.setDate(lastDate.getDate() - 1);
    sinceDate = lastDate.toISOString().split('T')[0];
    console.log(`📅 Último movimiento Fintoc en BD: ${lastFintocTx.date.toISOString().split('T')[0]}`);
    console.log(`📅 Descargando desde: ${sinceDate} (un día antes para overlap seguro)`);
  } else {
    // Si no hay ninguno, descargar desde inicio de 2026
    sinceDate = '2026-01-01';
    console.log(`⚠️  No se encontraron movimientos Fintoc previos. Descargando desde ${sinceDate}`);
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`📅 Hasta: ${today}\n`);

  // 3. Procesar cada link token
  let grandTotalNew = 0;
  let grandTotalExisting = 0;
  let grandTotalFromApi = 0;

  for (const linkToken of linkTokens) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔗 Procesando link: ${linkToken.slice(0, 25)}...`);
    console.log(`${'─'.repeat(50)}`);

    // Obtener cuentas del link
    const accRes = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${linkToken}`, {
      headers: { 'Authorization': apiKey }
    });

    if (!accRes.ok) {
      const errText = await accRes.text();
      console.error(`❌ Error obteniendo cuentas: ${accRes.status} - ${errText.slice(0, 200)}`);
      continue;
    }

    const accountsRaw: any = await accRes.json();
    const accounts: any[] = Array.isArray(accountsRaw) ? accountsRaw : [accountsRaw];

    for (const acc of accounts) {
      if (!acc.id) continue;
      const accId = acc.id;
      const bankName = acc.institution?.name || 'Fintoc Bank';
      const accNumber = acc.number || accId;
      console.log(`\n  🏦 Cuenta: ${accNumber} (${bankName}) - Tipo: ${acc.type || 'N/A'}`);

      // Buscar cuenta bancaria local
      let bankAccount = await prisma.bankAccount.findFirst({
        where: { accountNumber: accNumber, organizationId: org.id }
      });

      if (!bankAccount) {
        if (DRY_RUN) {
          console.log(`  ⏭️  [DRY RUN] Se crearía cuenta bancaria: ${accNumber}`);
          continue;
        }
        bankAccount = await prisma.bankAccount.create({
          data: {
            bankName: `${bankName} (Fintoc)`,
            accountNumber: accNumber,
            currency: acc.currency || 'CLP',
            rutHolder: org.rut,
            organizationId: org.id
          }
        });
        console.log(`  ✨ Cuenta creada en BD: ${bankAccount.id}`);
      } else {
        console.log(`  ✅ Cuenta existente: ${bankAccount.id}`);
      }

      // Paginar movimientos con since
      let allMovements: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          link_token: linkToken,
          since: sinceDate,
          per_page: '300',
          page: String(page)
        });

        const movRes = await fetch(`https://api.fintoc.com/v1/accounts/${accId}/movements?${params}`, {
          headers: { 'Authorization': apiKey }
        });

        if (!movRes.ok) {
          const errText = await movRes.text();
          console.error(`  ❌ Error movimientos página ${page}: ${movRes.status} - ${errText.slice(0, 200)}`);
          break;
        }

        const movements: any = await movRes.json();
        const movArray = Array.isArray(movements) ? movements : (movements?.results || []);

        if (movArray.length === 0) {
          hasMore = false;
        } else {
          allMovements = allMovements.concat(movArray);
          console.log(`  📄 Página ${page}: ${movArray.length} movimientos (acumulado: ${allMovements.length})`);
          page++;
          if (movArray.length < 300) hasMore = false;
          // Rate limiting
          await delay(500);
        }
      }

      console.log(`  📊 Total movimientos de Fintoc API: ${allMovements.length}`);
      grandTotalFromApi += allMovements.length;

      // Deduplicar en memoria
      const uniqueMovements: any[] = [];
      const seenFintocIds = new Set<string>();
      for (const mov of allMovements) {
        if (!seenFintocIds.has(mov.id)) {
          seenFintocIds.add(mov.id);
          uniqueMovements.push(mov);
        }
      }

      if (uniqueMovements.length < allMovements.length) {
        console.log(`  🔄 Duplicados en API eliminados: ${allMovements.length - uniqueMovements.length}`);
      }

      // Procesar cada movimiento contra la BD
      let accountNew = 0;
      let accountExisting = 0;

      for (const mov of uniqueMovements) {
        const externalId = mov.id;

        // Check 1: ¿Ya existe por fintocId?
        const byFintocId = await prisma.bankTransaction.findFirst({
          where: {
            metadata: { path: ['fintocId'], equals: externalId }
          }
        });

        if (byFintocId) {
          accountExisting++;
          continue;
        }

        // Check 2: Dedup por contenido (cuenta + fecha + monto + descripción)
        const rawDateStr = mov.post_date || mov.created_at;
        const checkDate = rawDateStr ? new Date(rawDateStr) : new Date();
        const startOfDay = new Date(checkDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(checkDate);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const byContent = await prisma.bankTransaction.findFirst({
          where: {
            bankAccountId: bankAccount.id,
            amount: mov.amount,
            type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
            date: { gte: startOfDay, lte: endOfDay }
          }
        });

        if (byContent) {
          accountExisting++;
          continue;
        }

        // Es nuevo → insertar
        if (DRY_RUN) {
          console.log(`  🆕 [DRY RUN] Nuevo: ${mov.post_date} | $${mov.amount} | ${(mov.description || '').slice(0, 50)}`);
          accountNew++;
          continue;
        }

        let finalDate = new Date(rawDateStr);
        if (rawDateStr && typeof rawDateStr === 'string' && rawDateStr.includes('T00:00:00Z')) {
          finalDate.setUTCHours(12, 0, 0, 0);
        }

        await prisma.bankTransaction.create({
          data: {
            bankAccountId: bankAccount.id,
            amount: mov.amount,
            description: mov.description || 'Movimiento Fintoc',
            date: finalDate,
            reference: mov.recipient_account?.number || externalId,
            type: mov.amount < 0 ? TransactionType.DEBIT : TransactionType.CREDIT,
            status: TransactionStatus.PENDING,
            origin: DataOrigin.API_INTEGRATION,
            metadata: {
              fintocId: externalId,
              fintocAccount: accId,
              syncDate: new Date().toISOString(),
              raw: mov
            }
          }
        });

        accountNew++;
      }

      console.log(`  ✅ Resultado: ${accountNew} nuevos, ${accountExisting} ya existían`);
      grandTotalNew += accountNew;
      grandTotalExisting += accountExisting;
    }
  }

  // Resumen final
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RESUMEN FINAL ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  📡 Total descargados de Fintoc API: ${grandTotalFromApi}`);
  console.log(`  🆕 Nuevos insertados en BD:          ${grandTotalNew}`);
  console.log(`  ♻️  Ya existentes (ignorados):        ${grandTotalExisting}`);
  console.log(`  📅 Rango: ${sinceDate} → ${today}`);
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
