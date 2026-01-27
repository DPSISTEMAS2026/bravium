export function ProviderTable() {
    const providers = [
        { id: 1, name: 'Comercializadora AG', amount: 12500000, invoices: 12, status: 'Active' },
        { id: 2, name: 'Distribuidora Central', amount: 8400000, invoices: 8, status: 'Active' },
        { id: 3, name: 'Servicios IT Ltda', amount: 4200000, invoices: 1, status: 'Pending' },
        { id: 4, name: 'Insumos Médicos SA', amount: 2100000, invoices: 3, status: 'Active' },
        { id: 5, name: 'Logística Express', amount: 1800000, invoices: 5, status: 'Warning' },
    ];

    return (
        <div className="card h-100">
            <div className="card-header bg-white py-3">
                <h5 className="card-title mb-0">Ranking de Proveedores</h5>
            </div>
            <div className="table-responsive">
                <table className="table table-hover table-nowrap mb-0 align-middle">
                    <thead className="table-light">
                        <tr>
                            <th scope="col">Proveedor</th>
                            <th scope="col">Facturas</th>
                            <th scope="col">Monto Total</th>
                            <th scope="col">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map((provider) => (
                            <tr key={provider.id}>
                                <td className="fw-medium">{provider.name}</td>
                                <td>{provider.invoices}</td>
                                <td>${provider.amount.toLocaleString()}</td>
                                <td>
                                    <span className={`badge rounded-pill ${provider.status === 'Active' ? 'bg-success-subtle text-success' :
                                            provider.status === 'Pending' ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'
                                        }`}>
                                        {provider.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
