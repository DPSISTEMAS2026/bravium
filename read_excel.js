const xlsx = require('xlsx');

const filePath = "d:\\BRAVIUM-PRODUCCION\\scripts\\Ultimos movimientos_nac16_04_2026 (1).xlsm";
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

// row 75 is index 74
console.log("Headers:");
console.log(data[0]);
console.log("Row 75:");
console.log(data[74]);
