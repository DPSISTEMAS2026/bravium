import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BancosModule } from './modules/bancos/bancos.module';
import { ConciliacionModule } from './modules/conciliacion/conciliacion.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { ProveedoresModule } from './modules/proveedores/proveedores.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { FinancialControlModule } from './modules/financial-control/financial-control.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module'; // Hypothetical common module

@Module({
  imports: [
    // Core Infrastructure
    ConfigModule.forRoot({ isGlobal: true }),
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
  providers: [],
})
export class AppModule { }
