import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BancosModule } from './modules/bancos/bancos.module';
import { ConciliacionModule } from './modules/conciliacion/conciliacion.module';
import { ContabilidadModule } from './modules/contabilidad/contabilidad.module';
import { ProveedoresModule } from './modules/proveedores/proveedores.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { FinancialControlModule } from './modules/financial-control/financial-control.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SchedulerService } from './common/services/scheduler.service';
import { CacheService } from './common/services/cache.service';
import { DataVisibilityService } from './common/services/data-visibility.service';
import { ReportesModule } from './modules/reportes/reportes.module';
import { PaymentRecordsModule } from './modules/payment-records/payment-records.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';

import { SearchModule } from './modules/search/search.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,

    BancosModule,
    ConciliacionModule,
    ContabilidadModule,
    ProveedoresModule,
    IngestionModule,
    FinancialControlModule,
    AuditModule,
    AuthModule,
    ReportesModule,
    PaymentRecordsModule,
    OrganizationsModule,
    SearchModule,
  ],
  controllers: [],
  providers: [SchedulerService, CacheService, DataVisibilityService],
  exports: [CacheService, DataVisibilityService],
})
export class AppModule { }
