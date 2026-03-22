const API_URL = 'https://bravium-backend.onrender.com';

async function verifyAndClean() {
    console.log('🔍 Intentando limpieza de datos...');
    try {
        const res = await fetch(`${API_URL}/conciliacion/clean-all`, { method: 'DELETE' });
        if (res.ok) {
            console.log('✅ Limpieza ejecutada. Las 116 conciliaciones deberían desaparecer.');
        } else {
            console.log(`⏳ Aún esperando despliegue (Status: ${res.status})`);
        }
    } catch (e) {
        console.log('❌ Error conexión:', e.message);
    }
}

verifyAndClean();
