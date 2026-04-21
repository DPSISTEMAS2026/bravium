import * as fs from 'fs';
import pdfParse from 'pdf-parse';

async function main() {
    const file = 'd:\\BRAVIUM-PRODUCCION\\scripts\\Estado Cuenta TC Santander Enero 2026.pdf';
    const dataBuffer = fs.readFileSync(file);
    const data = await pdfParse(dataBuffer);
    
    const lines = data.text.split('\n').filter(l => l.trim().length > 0);
    // Find lines close to "PERÍODO"
    for (let i = 0; i < 30; i++) {
        console.log(`L[${i}]: ${lines[i]}`);
    }
}
main();
