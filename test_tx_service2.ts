import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TransactionsService } from './src/modules/bancos/transactions.service';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const service = app.get(TransactionsService);

    const res = await service.getAllTransactions({
        organizationId: '715545b8-4522-4bb1-be81-3047546c0e8c',
        search: '288.960',
        status: 'ALL',
        limit: '20',
        fromDate: '2026-01-01'
    });

    console.log(`Found ${Array.isArray(res) ? res.length : res.data.length}`);
    await app.close();
}
run();
