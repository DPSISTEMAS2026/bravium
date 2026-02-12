import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule'; // Importar Scheduling
import { BancosModule } from './modules/bancos/bancos.module';
import { ConciliacionModule } from './modules/conciliacion/conciliacion.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { ProveedoresModule } from './modules/proveedores/proveedores.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { FinancialControlModule } from './modules/financial-control/financial-control.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SchedulerService } from './common/services/scheduler.service'; // Importar Servicio de Cron

@Module({
  imports: [
    // Core Infrastructure
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // Iniciar el módulo de tareas programadas
    PrismaModule,

    // Domain Modules
    BancosModule,
    ConciliacionModule,
    ContabilidadModule,
    ProveedoresModule,
    IngestionModule,
    FinancialControlModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [],
  providers: [SchedulerService], // Registrar el servicio de Cron
})
export class AppModule { }
