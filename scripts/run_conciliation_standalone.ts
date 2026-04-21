// Establecer env vars manualmente para evitar el error del ConfigModule
process.env.DATA_VISIBLE_FROM = '2026-01-01';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConciliacionService } from '../src/modules/conciliacion/conciliacion.service';

async function bootstrap() {
  console.log('Iniciando contexto de NestJS para ejecutar motor de conciliación...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  
  const conciliacionService = app.get(ConciliacionService);
  
  console.log('Disparando Reconciliation Cycle de forma directa...');
  const orgId = '715545b8-4522-4bb1-be81-3047546c0e8c'; // Bravium
  await conciliacionService.runReconciliationCycle('2026-01-01', '2026-12-31', orgId);
  
  console.log('Motor ha terminado.');
  await app.close();
  process.exit(0);
}

bootstrap().catch(console.error);
