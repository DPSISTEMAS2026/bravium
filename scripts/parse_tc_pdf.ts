import * as fs from 'fs';
import pdfParse from 'pdf-parse';

async function main() {
    const file = 'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Enero 2026.pdf';
    console.log(`\n\n--- PARSING: ${file.split('\\').pop()} ---`);
    const dataBuffer = fs.readFileSync(file);
    const data = await pdfParse(dataBuffer);
    
    const lines = data.text.split('\n').filter(l => l.trim().length > 0);
    
    // Find lines that start with DD/MM/YYYY or DD/MM
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^\d{2}\/\d{2}/.test(line)) {
            console.log(`L[${i}]: ${line}`);
        } else if (line.includes('COMPRA') || line.includes('ADOBE') || line.includes('$')) {
            // console.log(`  > ${line}`);
        }
    }
}

main().catch(console.error);
