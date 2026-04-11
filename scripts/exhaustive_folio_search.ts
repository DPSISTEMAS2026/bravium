import { PrismaClient } from '@prisma/client';
import * as https from 'https';

const prisma = new PrismaClient();

function postLibreDte(path: string, apiKey: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const bodyString = JSON.stringify(body);
        const options = {
            hostname: 'libredte.cl',
            path: '/api' + path,
            method: 'POST',
            headers: {
                'Authorization': `Basic ${apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': bodyString.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        let cleaned = data.trim();
                        const firstBracket = Math.min(
                            cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
                            cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
                        );
                        if (firstBracket < cleaned.length) {
                            cleaned = cleaned.substring(firstBracket);
                        }
                        const lastBracket = Math.max(
                            cleaned.lastIndexOf(']'),
                            cleaned.lastIndexOf('}')
                        );
                        if (lastBracket !== -1) {
                            cleaned = cleaned.substring(0, lastBracket + 1);
                        }
                        resolve(JSON.parse(cleaned));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                } else {
                    reject(new Error(`LibreDTE Error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(bodyString);
        req.end();
    });
}

async function main() {
    const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c';
    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    if (!org || !org.libreDteApiKey || !org.libreDteRut) {
        console.error('Org not found or missing credentials');
        return;
    }

    const types = ['dte_emitidos', 'dte_recibidos'];
    const periods = [
        { from: '2026-01-01', to: '2026-03-31' },
        { from: '2025-01-01', to: '2025-12-31' }
    ];

    console.log(`\n--- Búsqueda Exhaustiva de Folios 10155 y 1049 ---`);

    for (const type of types) {
        for (const period of periods) {
            console.log(`Checking ${type} for period ${period.from} to ${period.to}...`);
            try {
                const path = `/dte/${type}/buscar/${org.libreDteRut}?_contribuyente_rut=${org.libreDteRut}`;
                const data = await postLibreDte(path, org.libreDteApiKey, {
                    fecha_desde: period.from,
                    fecha_hasta: period.to,
                    limit: 1000
                });

                const matches = Array.isArray(data) ? data.filter((d: any) => d.folio == 10155 || d.folio == 1049) : [];
                if (matches.length > 0) {
                    console.log(`✅ ENCONTRADO en ${type} (${period.from}):`, matches);
                } else {
                    console.log(`❌ No encontrado en ${type} (${period.from})`);
                }
            } catch (e) {
                console.error(`Error checking ${type} (${period.from}):`, e.message);
            }
        }
    }
}

main().finally(() => prisma.$disconnect());
