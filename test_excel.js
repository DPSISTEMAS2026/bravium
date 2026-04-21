const xlsx = require('xlsx');

const filePath = "d:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm";
const workbook = xlsx.read(filePath, { type: 'file', cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
const headerIndex = rawRows.findIndex(row => {
    if (!Array.isArray(row)) return false;
    const cells = row.map(c => String(c).toUpperCase());
    const hasAmount = cells.some(c => c.includes('MONTO')) || 
                     (cells.some(c => c.includes('CARGO')) && cells.some(c => c.includes('ABONO')));
    const hasContext = cells.some(c => c.includes('FECHA')) || 
                      cells.some(c => c.includes('DESCRIPCI')) || 
                      cells.some(c => c.includes('DETALLE'));
    return hasAmount && hasContext;
});

console.log("Header index:", headerIndex);

let rows = [];
if (headerIndex !== -1) {
    rows = xlsx.utils.sheet_to_json(sheet, { 
        range: headerIndex, 
        raw: false, 
        dateNF: 'yyyy-mm-dd' 
    });
} else {
    rows = xlsx.utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });
}

console.log("Extracted rows count:", rows.length);
console.log("First row:");
console.log(rows[0]);
console.log("Row 75 equivalent:");
console.log(rows[73]);
