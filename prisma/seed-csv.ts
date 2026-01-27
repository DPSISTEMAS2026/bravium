
import { PrismaClient, DtePaymentStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const CSV_FILE = 'dte_recibidos_77154188.csv'; // Must be in root or same dir logic
const COMPANY_RUT = '76.201.228-5'; // Bravium

async function main() {
    console.log('--- Starting CSV DTE Seeding ---');

    const filePath = path.join(__dirname, '..', CSV_FILE);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Header: Emisor;Documento;Folio;Fecha;Total;Usuario
    // Skip header
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(';');
        if (parts.length < 5) continue;

        const [emisorName, docTypeStr, folioStr, fechaStr, totalStr] = parts;

        // 1. Resolve Provider
        // Since we don't have RUT in CSV, we create a deterministic fake RUT or search by name.
        // We'll generate a fake RUT based on name to keep it consistent across runs.
        const fakeRut = generateFakeRut(emisorName);

        let provider = await prisma.provider.findFirst({
            where: { rut: fakeRut }
        });

        if (!provider) {
            // Try check by name to avoid dupes if name matches but we used diff logic before?
            // No, let's stick to the generated RUT for simulation stability.
            provider = await prisma.provider.create({
                data: {
                    name: emisorName,
                    rut: fakeRut,
                    category: 'SIMULATED'
                }
            });
            console.log(`Created Provider: ${emisorName} (${fakeRut})`);
        }

        // 2. Resolve Type
        let typeCode = 33; // Factura Electrónica default
        if (docTypeStr.includes('Nota de crédito')) typeCode = 61;
        else if (docTypeStr.includes('exenta')) typeCode = 34;

        // 3. Parse Date (DD-MM-YYYY)
        const [d, m, y] = fechaStr.split('-');
        const issuedDate = new Date(`${y}-${m}-${d}`);

        // 4. Parse Amount
        const totalAmount = parseInt(totalStr.replace(/\./g, ''), 10);
        const folio = parseInt(folioStr, 10);

        // 5. Upsert DTE
        const dteData = {
            folio: folio,
            type: typeCode,
            rutIssuer: provider.rut,
            rutReceiver: COMPANY_RUT,
            totalAmount: totalAmount,
            issuedDate: issuedDate,
            siiStatus: 'ACEPTADO',
            providerId: provider.id,
            outstandingAmount: totalAmount,
            paymentStatus: DtePaymentStatus.UNPAID,
            origin: 'LEGACY_EXCEL' as any, // Cast if strictly typed in enum
        };

        const existing = await prisma.dTE.findUnique({
            where: {
                rutIssuer_type_folio: {
                    rutIssuer: provider.rut,
                    type: typeCode,
                    folio: folio
                }
            }
        });

        if (!existing) {
            await prisma.dTE.create({ data: dteData });
            count++;
        }
    }

    console.log(`--- Seeding Complete. Inserted ${count} DTEs. ---`);

    // Trigger Auto Match (Optional validation)
    console.log('Run /conciliacion/run-auto-match manually or via UI to match these.');
}

function generateFakeRut(name: string): string {
    // Simple hash to generated 8-9 digit number
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const num = Math.abs(hash) % 90000000 + 10000000; // Ensure 8 digits
    return `${num}-K`; // Simplification
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
