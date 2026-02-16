export default function ProveedoresPage() {
    return (
        <div className="bg-white shadow rounded-lg p-8 border border-gray-100 min-h-[50vh] flex flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-bold text-gray-900">Directorio de Proveedores</h2>
            <p className="mt-2 text-gray-500 max-w-lg">
                Gestión maestra de datos de proveedores, historial de precios y evaluación de servicio.
            </p>
            <div className="mt-6">
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                    Próximamente
                </span>
            </div>
        </div>
    );
}
