
async function triggerMatch() {
    console.log('Triggering Auto-Match in Production...');
    try {
        const res = await fetch('https://bravium-backend.onrender.com/conciliacion/run-auto-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        console.log('Match Result:', data);
    } catch (error) {
        console.error('Trigger failed:', error);
    }
}
triggerMatch();
