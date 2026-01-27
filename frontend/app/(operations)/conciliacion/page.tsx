import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

export default function ConciliacionPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Conciliación Bancaria</h1>
                    <p className="text-slate-500 mt-1">Revisa las coincidencias automáticas y resuelve manuales.</p>
                </div>
                <div className="flex space-x-3">
                    <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm">
                        Volver a Ejecutar Motor (re-match)
                    </button>
                    <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-emerald-600/20">
                        Confirmar Seleccionados
                    </button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                    <span className="text-blue-600 font-bold block text-xl">12</span>
                    <span className="text-blue-800 text-sm">Pendientes de Revisión</span>
                </div>
                <div className="bg-green-50 border border-green-100 p-4 rounded-xl">
                    <span className="text-green-600 font-bold block text-xl">542</span>
                    <span className="text-green-800 text-sm">Conciliados (Mes Actual)</span>
                </div>
            </div>

            {/* Main Reconciliation Interface */}
            <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-700">Matches Sugeridos (Drafts)</h3>
                    <span className="text-xs text-slate-400">Mostrando 12 de 12 pendientes</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-3 w-1/3">Transacción Bancaria</th>
                                <th className="px-6 py-3 w-1/3">Coincidencia Sugerida (Sistema)</th>
                                <th className="px-6 py-3">Score</th>
                                <th className="px-6 py-3">Diferencia</th>
                                <th className="px-6 py-3 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {/* Row 1: High Confidence Match */}
                            <tr className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-6 py-4 align-top">
                                    <div className="font-medium text-slate-900">Transferencia A Juan Perez</div>
                                    <div className="text-xs text-slate-500">25 Ene 2026 • Ref: 998877</div>
                                    <div className="font-bold text-red-600 mt-1">-$1.500.000</div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="p-3 bg-white border border-emerald-200 rounded-lg shadow-sm group-hover:border-emerald-400">
                                        <div className="flex items-center space-x-2">
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">FACTURA</span>
                                            <span className="font-medium text-slate-800">Factura #4059 - Insumos Perez SpA</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">Emitida: 20 Ene 2026</div>
                                        <div className="font-bold text-slate-800 mt-1">$1.500.000</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="flex items-center text-emerald-600 font-bold">
                                        <CheckCircleIcon className="h-5 w-5 mr-1" />
                                        100%
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-top text-slate-400 font-medium">
                                    $0
                                </td>
                                <td className="px-6 py-4 align-top text-right">
                                    <button className="text-emerald-600 font-medium hover:bg-emerald-50 px-3 py-1 rounded-lg">Aceptar</button>
                                </td>
                            </tr>

                            {/* Row 2: Fuzzy Match with Difference */}
                            <tr className="hover:bg-blue-50/30 transition-colors group bg-yellow-50/30">
                                <td className="px-6 py-4 align-top">
                                    <div className="font-medium text-slate-900">Pago Proveedor Web</div>
                                    <div className="text-xs text-slate-500">24 Ene 2026</div>
                                    <div className="font-bold text-red-600 mt-1">-$100.500</div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="p-3 bg-white border border-yellow-300 rounded-lg shadow-sm group-hover:border-yellow-400">
                                        <div className="flex items-center space-x-2">
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">FACTURA</span>
                                            <span className="font-medium text-slate-800">Factura #9901 - Hosting Service</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">Emitida: 24 Ene 2026</div>
                                        <div className="font-bold text-slate-800 mt-1">$100.000</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                    <div className="flex items-center text-yellow-600 font-bold">
                                        95%
                                    </div>
                                    <span className="text-[10px] text-slate-400 block mt-1">Diferencia $500</span>
                                </td>
                                <td className="px-6 py-4 align-top text-red-500 font-bold">
                                    -$500
                                    <div className="text-[10px] text-slate-400 font-normal">¿Ajustar diferencia?</div>
                                </td>
                                <td className="px-6 py-4 align-top text-right space-x-2">
                                    <button className="text-slate-400 hover:text-slate-600 text-sm">Rechazar</button>
                                    <button className="text-blue-600 font-medium hover:bg-blue-50 px-3 py-1 rounded-lg border border-transparent hover:border-blue-200">
                                        Aceptar con Ajuste
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
