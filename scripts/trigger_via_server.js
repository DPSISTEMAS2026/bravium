const { spawn } = require('child_process');

async function main() {
  console.log('Iniciando el servidor nest...');
  const server = spawn('npm', ['run', 'start'], { shell: true });

  server.stdout.on('data', (data) => {
    const text = data.toString();
    // console.log(text);
    if (text.includes('Nest application successfully started')) {
      console.log('Servidor arriba. Lanzando petición...');
      
      const payload = {
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        organizationId: '715545b8-4522-4bb1-be81-3047546c0e8c'
      };

      fetch('http://localhost:3000/conciliacion/run-auto-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(r => r.json().catch(() => ({})))
      .then(res => {
        console.log('Respuesta del motor de conciliación:', res);
        console.log('Cerrando servidor...');
        server.kill();
        process.exit(0);
      })
      .catch(err => {
        console.error('Error al hacer petición:', err);
        server.kill();
        process.exit(1);
      });
    }
  });

  server.stderr.on('data', (err) => {
    console.error(`SERVER ERROR: ${err}`);
  });
}

main();
