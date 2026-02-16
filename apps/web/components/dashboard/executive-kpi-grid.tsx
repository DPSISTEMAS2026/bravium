import { ArrowUpIcon, ArrowDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const stats = [
    { name: 'Saldo Consolidado', stat: '$14.050.000', change: '+5.4%', changeType: 'increase', icon: ArrowUpIcon, color: 'text-green-600' },
    { name: 'Deuda Proveedores', stat: '$3.200.000', change: '-1.2%', changeType: 'decrease', icon: ArrowDownIcon, color: 'text-gray-900' },
    { name: 'Ahorro Potencial', stat: '$850.000', change: '+12%', changeType: 'increase', icon: ArrowUpIcon, color: 'text-blue-600' },
];

export function ExecutiveKPIGrid() {
    return (
        <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900">Resumen Financiero</h3>
            <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                {stats.map((item) => (
                    <div key={item.name} className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">{item.name}</dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 flex items-baseline gap-2">
                            {item.stat}
                            <span className={`text-sm font-medium ${item.changeType === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
                                {item.change}
                            </span>
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
