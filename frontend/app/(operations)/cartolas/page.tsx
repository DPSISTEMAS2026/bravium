export default function CartolasPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Cartolas Bancarias</h1>
                    <p className="text-slate-500 mt-1">Sube tus archivos Excel para procesar conciliaciones.</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center shadow-lg shadow-blue-600/20">
                    <span>+ Subir Cartola Nueva</span>
                </button>
            </div>

            {/* Upload Zone Stub */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                <p className="text-slate-600 font-medium">Arrastra tu archivo Excel aquí</p>
                <p className="text-sm text-slate-400 mt-2">Soporta .xlsx, .csv (Banco Chile, Santander, BCI)</p>
            </div>

            {/* Recent Uploads Table */}
            <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-semibold text-slate-700">Historial de Cargas</h3>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-6 py-3">Fecha Carga</th>
                            <th className="px-6 py-3">Archivo</th>
                            <th className="px-6 py-3">Banco</th>
                            <th className="px-6 py-3">Total Tx</th>
                            <th className="px-6 py-3">Conciliado</th>
                            <th className="px-6 py-3">Estado</th>
                            <th className="px-6 py-3">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50">
                            <td className="px-6 py-4">25 Ene 2026</td>
                            <td className="px-6 py-4 font-medium text-slate-900">Cartola_Enero_2026.xlsx</td>
                            <td className="px-6 py-4">Banco Chile</td>
                            <td className="px-6 py-4">158</td>
                            <td className="px-6 py-4 text-green-600 font-bold">98%</td>
                            <td className="px-6 py-4"><span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">PROCESADO</span></td>
                            <td className="px-6 py-4 text-blue-600 hover:underline cursor-pointer">Ver Detalle</td>
                        </tr>
                        {/* Mock Row 2 */}
                        <tr className="hover:bg-slate-50">
                            <td className="px-6 py-4">20 Ene 2026</td>
                            <td className="px-6 py-4 font-medium text-slate-900">Cartola_Diciembre_2025.csv</td>
                            <td className="px-6 py-4">Santander</td>
                            <td className="px-6 py-4">420</td>
                            <td className="px-6 py-4 text-yellow-600 font-bold">45%</td>
                            <td className="px-6 py-4"><span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">PARCIAL</span></td>
                            <td className="px-6 py-4 text-blue-600 hover:underline cursor-pointer">Continuar</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
