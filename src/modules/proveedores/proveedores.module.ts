import { Module } from '@nestjs/common';
import { ProveedoresController } from './proveedores.controller';
import { ProveedoresService } from './proveedores.service';
import { PagoMasivoExportService } from './services/pago-masivo-export.service';

@Module({
    controllers: [ProveedoresController],
    providers: [ProveedoresService, PagoMasivoExportService],
    exports: [ProveedoresService, PagoMasivoExportService],
})
export class ProveedoresModule { }
