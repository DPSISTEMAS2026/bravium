import { ArrowDownTrayIcon, LockClosedIcon } from '@heroicons/react/24/outline';

export default function ReportesPage() {
    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Cierre Contable y Reportes</h1>
                    <p className="text-slate-500 mt-1">Gestión de períodos y exportación oficial.</p>
                </div>
            </div>

            {/* Period Control */}
            <div className="bg-white border server-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800">Período Actual: Enero 2026</h3>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-bold text-sm">ABIERTO</span>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase">Alertas Bloqueantes</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">3 Críticas</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase">Conciliación</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">92%</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase">Diferencias Sin Resolver</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">$1.200</p>
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button className="flex items-center space-x-2 bg-slate-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                        <LockClosedIcon className="h-5 w-5" />
                        <span>Cerrar Período</span>
                    </button>
                </div>
                <p className="text-right text-xs text-red-500 mt-2 font-medium">
                    * No se puede cerrar: Existen alertas críticas pendientes.
                </p>
            </div>

            {/* Export Zone */}
            <div className="grid grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-2">Exportar a Nubox</h3>
                    <p className="text-sm text-slate-500 mb-4">Genera el archivo CSV de Comprobantes Contables compatible con Nubox Pro.</p>
                    <button className="w-full border border-blue-600 text-blue-600 font-bold py-2 rounded-lg hover:bg-blue-50 flex justify-center items-center">
                        <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                        Descargar CSV Nubox
                    </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-2">Libro Diario (SII)</h3>
                    <p className="text-sm text-slate-500 mb-4">Formato estándar para fiscalización y respaldo tributario.</p>
                    <button className="w-full border border-slate-300 text-slate-600 font-bold py-2 rounded-lg hover:bg-slate-50 flex justify-center items-center">
                        <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                        Descargar PDF / Excel
                    </button>
                </div>
            </div>
        </div>
    );
}
