
const fs = require('fs');
const path = require('path');

async function upload() {
    const filePath = path.join(__dirname, 'dte_recibidos_77154188.csv');
    if (!fs.existsSync(filePath)) {
        console.error('CSV File not found');
        return;
    }

    const csvContent = fs.readFileSync(filePath, 'utf-8');

    console.log('Uploading CSV to Production...');

    try {
        const res = await fetch('https://bravium-backend.onrender.com/ingestion/manual/dtes-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csvContent })
        });

        const data = await res.json();
        console.log('Response:', data);
    } catch (error) {
        console.error('Upload failed:', error);
    }
}

upload();
