import { ExecutiveKPIGrid } from '../../components/dashboard/executive-kpi-grid';
import { ActionableAlertsFeatures } from '../../components/dashboard/actionable-alerts';

export default function DashboardPage() {
    return (
        <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
                <h1 className="text-2xl font-semibold text-gray-900">Bienvenido a Bravium</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Tu centro de control financiero. Estado actual al {new Date().toLocaleDateString()}.
                </p>
            </div>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
                <div className="py-4">
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

                        {/* Columna Izquierda: KPIs y Gráficos */}
                        <div className="space-y-8">
                            <ExecutiveKPIGrid />

                            {/* Placeholder for future Chart */}
                            <div className="overflow-hidden rounded-lg bg-white shadow">
                                <div className="p-6">
                                    <h3 className="text-base font-semibold leading-6 text-gray-900 mb-4">Flujo de Caja (Últimos 6 meses)</h3>
                                    <div className="h-64 bg-gray-50 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                                        <span className="text-gray-400">Gráfico de Ingresos vs Egresos</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Columna Derecha: Alertas y Feed */}
                        <div className="space-y-8">
                            <ActionableAlertsFeatures />

                            {/* Recent Activity */}
                            <div className="bg-white shadow sm:rounded-lg">
                                <div className="px-4 py-5 sm:p-6">
                                    <h3 className="text-base font-semibold leading-6 text-gray-900">Actividad Reciente</h3>
                                    <ul role="list" className="divide-y divide-gray-100 mt-4">
                                        <li className="flex gap-x-4 py-2">
                                            <div className="flex-auto">
                                                <p className="text-sm font-semibold leading-6 text-gray-900">Conciliación Automática</p>
                                                <p className="mt-1 truncate text-xs leading-5 text-gray-500">Se conciliaron 45 movimientos bancarios.</p>
                                            </div>
                                            <time className="flex-none text-xs text-gray-500 py-0.5">hace 2h</time>
                                        </li>
                                        <li className="flex gap-x-4 py-2">
                                            <div className="flex-auto">
                                                <p className="text-sm font-semibold leading-6 text-gray-900">Nuevo DTE Recibido</p>
                                                <p className="mt-1 truncate text-xs leading-5 text-gray-500">Factura #3321 de Proveedor ABC.</p>
                                            </div>
                                            <time className="flex-none text-xs text-gray-500 py-0.5">hace 4h</time>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
