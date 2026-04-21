import * as xlsx from 'xlsx';

try {
  // Leemos el archivo Excel propuesto
  const workbook = xlsx.readFile('d:\\BRAVIUM-PRODUCCION\\scripts\\Pagos 2026 (3) (1).xlsx');

  // Tomamos la primera hoja
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convertimos a JSON
  const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

  console.log(`--- Información del Excel ---`);
  console.log(`Hojas disponibles: ${workbook.SheetNames.join(', ')}`);
  console.log(`Total de filas detectadas en la hoja "${sheetName}": ${data.length}\n`);

  if (data.length > 0) {
    console.log(`--- Estructura (Columnas) ---`);
    console.log(Object.keys(data[0]));

    console.log(`\n--- Muestra de las primeras 5 filas ---`);
    for (let i = 0; i < Math.min(5, data.length); i++) {
      console.log(data[i]);
    }
  } else {
    console.log('El archivo parece estar vacío o no pudo ser leído con esta estructura.');
  }

} catch (error) {
  console.error("Error al leer el archivo. Es posible que xlsx no esté instalado. Error:", error);
}
