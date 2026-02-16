import Link from 'next/link';
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const alerts = [
    {
        id: 1,
        title: '5 Facturas sin conciliar > 30 días',
        description: 'Riesgo de multa o recargo. Revisar en Conciliación.',
        severity: 'high',
        href: '/conciliacion',
    },
    {
        id: 2,
        title: 'Sobreprecio detectado en "Harina Selecta"',
        description: 'Estás pagando 15% más que el mes pasado.',
        severity: 'medium',
        href: '/purchase-intelligence',
    },
];

export function ActionableAlertsFeatures() {
    return (
        <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">Acciones Pendientes</h3>
                <div className="mt-5 space-y-4">
                    {alerts.map((alert) => (
                        <div key={alert.id} className={`border-l-4 p-4 ${alert.severity === 'high' ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'}`}>
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <ExclamationCircleIcon className={`h-5 w-5 ${alert.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`} aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <p className={`text-sm font-medium ${alert.severity === 'high' ? 'text-red-800' : 'text-yellow-800'}`}>
                                        {alert.title}
                                    </p>
                                    <div className={`mt-2 text-sm ${alert.severity === 'high' ? 'text-red-700' : 'text-yellow-700'}`}>
                                        <p>{alert.description}</p>
                                    </div>
                                    <div className="mt-4">
                                        <div className="-mx-2 -my-1.5 flex">
                                            <Link href={alert.href} className={`rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${alert.severity === 'high' ? 'bg-red-50 text-red-800 hover:bg-red-100 focus:ring-red-600' : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 focus:ring-yellow-600'}`}>
                                                Resolver ahora
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
