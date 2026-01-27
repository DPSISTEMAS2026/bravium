import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

const providers = [
    { id: 1, name: 'Insumos Globales SpA', rut: '76.102.000-K', category: 'Insumos', balance: 4500000, status: 'CRITICAL' },
    { id: 2, name: 'Servicios IT Chile', rut: '77.200.300-1', category: 'Servicios', balance: 0, status: 'OK' },
    { id: 3, name: 'Arriendo Oficinas Ltda', rut: '76.500.222-2', category: 'Infraestructura', balance: 1200000, status: 'WARNING' },
    // ... more mocks
];

export default function ProveedoresPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Proveedores</h1>
                    <p className="text-slate-500 mt-1">Gestión de saldos y deuda histórica.</p>
                </div>
                <button className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    + Nuevo Proveedor
                </button>
            </div>

            {/* Filters */}
            <div className="flex space-x-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o RUT..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    />
                </div>
                <button className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium">
                    <FunnelIcon className="h-4 w-4" />
                    <span>Filtros</span>
                </button>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-6 py-3">Proveedor / RUT</th>
                            <th className="px-6 py-3">Categoría</th>
                            <th className="px-6 py-3 text-right">Saldo Actual (Deuda)</th>
                            <th className="px-6 py-3 text-center">Estado</th>
                            <th className="px-6 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {providers.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-slate-900">{p.name}</div>
                                    <div className="text-xs text-slate-400">{p.rut}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                                        {p.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-slate-700">
                                    ${p.balance.toLocaleString('es-CL')}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {p.status === 'CRITICAL' && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                            Deuda Vencida
                                        </span>
                                    )}
                                    {p.status === 'WARNING' && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            Pendiente
                                        </span>
                                    )}
                                    {p.status === 'OK' && (
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            Al Día
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-blue-600 font-medium hover:underline">Ver Cartola</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
