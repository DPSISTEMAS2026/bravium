export function ProviderRanking() {
    const providers = [
        { id: 1, name: 'Comercializadora AG', amount: 12500000, invoices: 12, status: 'Active' },
        { id: 2, name: 'Distribuidora Central', amount: 8400000, invoices: 8, status: 'Active' },
        { id: 3, name: 'Servicios IT Ltda', amount: 4200000, invoices: 1, status: 'Pending' },
        { id: 4, name: 'Insumos Médicos SA', amount: 2100000, invoices: 3, status: 'Active' },
        { id: 5, name: 'Logística Express', amount: 1800000, invoices: 5, status: 'Warning' },
    ];

    return (
        <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Top Proveedores (Gasto Acumulado)</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facturas</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto Total</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {providers.map((provider) => (
                            <tr key={provider.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{provider.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{provider.invoices}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${provider.amount.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${provider.status === 'Active' ? 'bg-green-100 text-green-800' :
                                            provider.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
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
