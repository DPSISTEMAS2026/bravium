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
                console.log('--- Status Code:', res.statusCode);
                console.log('--- Raw Data Sample:', data.substring(0, 500));
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        let cleaned = data.trim();
                        // Remover cualquier cosa antes del primer [ o {
                        const firstBracket = Math.min(
                            cleaned.indexOf('[') === -1 ? cleaned.length : cleaned.indexOf('['),
                            cleaned.indexOf('{') === -1 ? cleaned.length : cleaned.indexOf('{')
                        );
                        if (firstBracket < cleaned.length) {
                            cleaned = cleaned.substring(firstBracket);
                        }
                        // Remover cualquier cosa después del último ] o }
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
                    reject(new Error(`LibreDTE Error ${res.statusCode}`));
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

    console.log(`\n--- Test de Sincronización (Solo 1 día) ---`);
    try {
        const path = `/dte/dte_recibidos/buscar/${org.libreDteRut}?_contribuyente_rut=${org.libreDteRut}`;
        const data = await postLibreDte(path, org.libreDteApiKey, {
            fecha_desde: '2026-01-10',
            fecha_hasta: '2026-01-11',
            limit: 10
        });
        
        console.log('Parse success! Structure check:', Array.isArray(data) ? 'Array' : typeof data);
        if (Array.isArray(data)) console.log('Items found:', data.length);
    } catch (e) {
        console.error(`Test failed:`, e);
    }
}

main().finally(() => prisma.$disconnect());
