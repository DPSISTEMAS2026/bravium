import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
// import { BancosController } from './bancos.controller';
// import { BancosService } from './bancos.service';

@Module({
    controllers: [TransactionsController], // Placeholder for BancosController
    providers: [TransactionsService],   // Placeholder for BancosService, CartolaImporterService
    exports: [TransactionsService],     // Export services if needed by other modules
})
export class BancosModule { }
