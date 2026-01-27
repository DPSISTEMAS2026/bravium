import Link from 'next/link';
import KpiCard from '../components/ui/KpiCard';
import {
    ExclamationTriangleIcon,
    CheckBadgeIcon,
    CurrencyDollarIcon,
    ClockIcon
} from '@heroicons/react/24/solid';

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Hola, Administrador</h1>
                    <p className="text-slate-500 mt-2">Resumen financiero al <span className="font-semibold text-slate-700">25 de Enero, 2026</span>.</p>
                </div>
                <div className="flex space-x-3">
                    <button className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg border border-transparent font-medium shadow-lg shadow-slate-900/20">
                        Ver Reportes Completos
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <KpiCard
                    title="Saldo Banco"
                    value="$145.200.590"
                    trend="+12% vs mes anterior"
                    trendDirection="up"
                    icon={CurrencyDollarIcon}
                />
                <KpiCard
                    title="Por Pagar (Vencido)"
                    value="$4.500.000"
                    trend="3 facturas críticas"
                    trendDirection="down"
                    icon={ExclamationTriangleIcon}
                />
                <KpiCard
                    title="Por Pagar (Total)"
                    value="$32.100.000"
                    trend="Estable"
                    trendDirection="neutral"
                    icon={ClockIcon}
                />
                <KpiCard
                    title="Conciliación Mes"
                    value="92%"
                    trend="Faltan 12 movimientos"
                    trendDirection="neutral"
                    icon={CheckBadgeIcon}
                />
            </div>

            {/* Critical Alerts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Alerts */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                        Atención Requerida (3)
                    </h3>
                    <div className="space-y-3">
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex justify-between items-center">
                            <div>
                                <p className="text-sm font-bold text-red-800">Factura Vencida #9921</p>
                                <p className="text-xs text-red-600">Proveedor: Insumos Globales SpA • Venció hace 45 días</p>
                            </div>
                            <button className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1 rounded hover:bg-red-100">
                                Ver
                            </button>
                        </div>
                        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg flex justify-between items-center">
                            <div>
                                <p className="text-sm font-bold text-yellow-800">Diferencia Recurrente</p>
                                <p className="text-xs text-yellow-600">Proveedor: Hosting Services • 5 meses con dif. de $100</p>
                            </div>
                            <button className="text-xs bg-white border border-yellow-200 text-yellow-700 px-3 py-1 rounded hover:bg-yellow-100">
                                Resolver
                            </button>
                        </div>
                        <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg flex justify-between items-center">
                            <div>
                                <p className="text-sm font-bold text-blue-800">Cierre de Mes Pendiente</p>
                                <p className="text-xs text-blue-600">Enero 2026: Conciliación al 92%</p>
                            </div>
                            <Link href="/conciliacion" className="text-xs bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded hover:bg-blue-100">
                                Ir a Conciliar
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Financial Summary Chart Stub */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center items-center text-center">
                    <div className="h-40 w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center mb-4">
                        <span className="text-slate-400 font-medium">Gráfico de Flujo de Caja (Próximamente)</span>
                    </div>
                    <p className="text-sm text-slate-500">
                        La proyección de flujo de caja estará disponible una vez se cierren los últimos 3 períodos contables.
                    </p>
                </div>
            </div>
        </div>
    );
}
