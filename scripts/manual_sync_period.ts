import { LibreDteService } from './src/modules/ingestion/services/libredte.service';
import { PrismaService } from './src/common/prisma/prisma.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function sync() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const service = app.get(LibreDteService);
    const orgId = '715545b8-4522-4bb1-be81-30475466c0e8c';
    
    console.log('--- Iniciando Sincronización Manual Enero 2026 ---');
    try {
        const result = await service.fetchReceivedDTEs('2026-01-01', '2026-01-31', orgId);
        console.log('Resultado Enero:', JSON.stringify(result, null, 2));
        
        console.log('--- Iniciando Sincronización Manual Febrero 2026 ---');
        const resultFeb = await service.fetchReceivedDTEs('2026-02-01', '2026-02-28', orgId);
        console.log('Resultado Febrero:', JSON.stringify(resultFeb, null, 2));
    } catch (e) {
        console.error('Error durante la sincronización:', e);
    } finally {
        await app.close();
    }
}

sync();
