export default function FacturasPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Facturas (DTE)</h1>
                    <p className="text-slate-500 mt-1">Sincronizado automáticamente con el SII.</p>
                </div>
                <button className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-slate-50">
                    Forzar Sincronización
                </button>
            </div>

            {/* Placeholder for Data Table */}
            <div className="bg-white p-12 text-center border border-slate-200 rounded-xl shadow-sm">
                <p className="text-slate-500">Módulo de Facturas en construcción.</p>
                <p className="text-sm text-slate-400 mt-2">Aquí se visualizarán todos los DTE recibidos y emitidos.</p>
            </div>
        </div>
    );
}
