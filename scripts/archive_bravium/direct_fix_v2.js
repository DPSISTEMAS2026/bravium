const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgres://bravium_user:9nvnhkIrPFRdX0t1UF7eVMN0dBLu9dg9@dpg-d6s0app2lte0c79gfflp-a.oregon-postgres.render.com/bravium_prod?ssl=true',
    ssl: {
        rejectUnauthorized: false
    }
});

async function run() {
    try {
        await client.connect();
        console.log('✅ CONEXIÓN ÉXITOSA');
        await client.query('DELETE FROM "ReconciliationMatch"');
        console.log('✅ Matches borrados.');
        await client.query('UPDATE "BankTransaction" SET status = \'PENDING\'');
        console.log('✅ Transacciones reseteadas.');
        await client.end();
    } catch (e) {
        console.error('❌ ERROR:', e.message);
    }
}

run();
