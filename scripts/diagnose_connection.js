const API_URL = 'https://bravium-backend.onrender.com';

async function checkHealth() {
    console.log(`Checking connectivity to ${API_URL}...`);
    try {
        const res = await fetch(API_URL);
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response: ${text.substring(0, 100)}...`);

        console.log('\nChecking /conciliacion/clean-all...');
        const resClean = await fetch(`${API_URL}/conciliacion/clean-all`, { method: 'DELETE' });
        console.log(`Clean Status: ${resClean.status} ${resClean.statusText}`);

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

checkHealth();
