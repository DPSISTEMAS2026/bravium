import Link from 'next/link';
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

type ActionableAlertsFeaturesProps = {
    pendingTransactions: number;
    pendingDtes: number;
    unmatchedHighValueTx: number;
    unmatchedHighValueDtes: number;
};

export function ActionableAlertsFeatures(props: ActionableAlertsFeaturesProps) {
    const alerts = [
        {
            id: 'pending-tx',
            title: `${props.pendingTransactions.toLocaleString('es-CL')} transacciones pendientes`,
            description: 'Revisa el tablero de conciliación y ejecuta auto-match si corresponde.',
            severity: props.pendingTransactions > 0 ? 'high' : 'low',
            href: '/conciliacion',
        },
        {
            id: 'pending-dtes',
            title: `${props.pendingDtes.toLocaleString('es-CL')} DTEs impagos`,
            description: 'Prioriza proveedores con mayor monto pendiente y valida pagos en cartola.',
            severity: props.pendingDtes > 0 ? 'medium' : 'low',
            href: '/facturas',
        },
        {
            id: 'high-value',
            title: 'Movimientos de alto valor sin match',
            description: `${props.unmatchedHighValueTx} transacciones y ${props.unmatchedHighValueDtes} DTEs sobre $1.000.000 CLP sin conciliar.`,
            severity: props.unmatchedHighValueTx + props.unmatchedHighValueDtes > 0 ? 'medium' : 'low',
            href: '/conciliacion',
        },
    ];

    return (
        <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">Acciones Pendientes</h3>
                <div className="mt-5 space-y-4">
                    {alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`border-l-4 p-4 ${alert.severity === 'high'
                                ? 'border-red-500 bg-red-50'
                                : alert.severity === 'medium'
                                    ? 'border-yellow-500 bg-yellow-50'
                                    : 'border-emerald-500 bg-emerald-50'
                                }`}
                        >
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    {alert.severity === 'low' ? (
                                        <CheckCircleIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                                    ) : (
                                        <ExclamationCircleIcon
                                            className={`h-5 w-5 ${alert.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`}
                                            aria-hidden="true"
                                        />
                                    )}
                                </div>
                                <div className="ml-3">
                                    <p className={`text-sm font-medium ${alert.severity === 'high'
                                        ? 'text-red-800'
                                        : alert.severity === 'medium'
                                            ? 'text-yellow-800'
                                            : 'text-emerald-800'
                                        }`}>
                                        {alert.title}
                                    </p>
                                    <div className={`mt-2 text-sm ${alert.severity === 'high'
                                        ? 'text-red-700'
                                        : alert.severity === 'medium'
                                            ? 'text-yellow-700'
                                            : 'text-emerald-700'
                                        }`}>
                                        <p>{alert.description}</p>
                                    </div>
                                    <div className="mt-4">
                                        <div className="-mx-2 -my-1.5 flex">
                                            <Link
                                                href={alert.href}
                                                className={`rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${alert.severity === 'high'
                                                    ? 'bg-red-50 text-red-800 hover:bg-red-100 focus:ring-red-600'
                                                    : alert.severity === 'medium'
                                                        ? 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100 focus:ring-yellow-600'
                                                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 focus:ring-emerald-600'
                                                    }`}
                                            >
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
