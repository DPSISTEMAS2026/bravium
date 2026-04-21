import * as xlsx from 'xlsx';

function main() {
    const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');
    
    const accs = new Set();
    let totalRows = 0;
    
    for (const sheetName of workbook.SheetNames) {
        const rawData = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: "" });
        totalRows += rawData.length;
        
        for (const row of rawData) {
            const cuenta = String(row['Transferencia Banco / Tarjeta'] || '').trim();
            if (cuenta) accs.add(cuenta);
        }
    }
    
    console.log(`Total rows in Excel overall: ${totalRows}`);
    console.log('Cuentas encontradas en Excel:');
    console.log(Array.from(accs));
}
main();
