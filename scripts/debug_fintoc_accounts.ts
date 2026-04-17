async function main() {
    const apiKey = 'sk_live_6ct1qeB_CSKUY_u3PzJaMuos-Cmt_9qr4VtT39fHykM';
    const linkToken = 'link_J0WLYbi4RwEZXxAB_token_YdkzD6wkjxPwiHrcpmd-8LdS';

    const response = await fetch(`https://api.fintoc.com/v1/accounts?link_token=${linkToken}`, {
        headers: { 'Authorization': apiKey }
    });

    if (response.ok) {
        const accounts = await response.json();
        console.log(`El Link de Santander proporcionó ${accounts.length} cuentas:`);
        accounts.forEach((acc: any) => {
            console.log(`- Nombre: ${acc.name}`);
            console.log(`  Tipo oficial Fintoc: ${acc.type}`);
            console.log(`  Número: ${acc.number}`);
            console.log(`  Moneda: ${acc.currency}`);
        });
    } else {
        console.error("Error", await response.text());
    }
}

main();
