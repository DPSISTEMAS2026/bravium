import * as xlsx from 'xlsx';

const file = 'd:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac24_03_2026.xlsm';
const wb = xlsx.readFile(file);
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log('--- EXCEL PREVIEW ---');
console.log('Sheet Name:', sheetName);
for(let i=0; i<Math.min(15, data.length); i++) {
    console.log(`Row ${i}:`, data[i]);
}
