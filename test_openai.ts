import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OpenAiService } from './src/modules/ingestion/services/openai.service';
import * as fs from 'fs';
import * as xlsx from 'xlsx';

async function run() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const openai = app.get(OpenAiService);

    const filePath = "d:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm";
    const workbook = xlsx.read(filePath, { type: 'file', cellDates: true });
    let rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { range: 6, raw: false, dateNF: 'yyyy-mm-dd' });

    console.log("Raw rows to OpenAI:", rows.length);
    const normalized = await openai.normalizeBankRows(rows);
    fs.writeFileSync('d:\\BRAVIUM-PRODUCCION\\tmp_normalized.json', JSON.stringify(normalized, null, 2));

    let amtCounter = 0;
    for(const r of normalized) {
        if (Math.abs(r.amount) == 288960) amtCounter++;
    }
    console.log("Found 288960:", amtCounter);

    await app.close();
}
run();
