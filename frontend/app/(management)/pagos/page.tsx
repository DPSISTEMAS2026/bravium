export default function PagosPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Pagos</h1>
                    <p className="text-slate-500 mt-1">Registro de egresos y nóminas de pago.</p>
                </div>
                <button className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium">
                    + Registrar Pago Manual
                </button>
            </div>

            {/* Placeholder for Data Table */}
            <div className="bg-white p-12 text-center border border-slate-200 rounded-xl shadow-sm">
                <p className="text-slate-500">Módulo de Pagos en construcción.</p>
                <p className="text-sm text-slate-400 mt-2">Gestión de transferencias, cheques y nóminas.</p>
            </div>
        </div>
    );
}
