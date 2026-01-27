import { usePurchaseRecommendations } from '../../hooks/use-purchase-recommendations';

// Mock Data for KPI (Still mocked for now as it needs aggregate endpoint)
const KPI_DATA = {
    potentialMonthlySaving: 1250000,
    potentialAnnualSaving: 15000000,
    overpricedProductCount: 12,
};

export default function PurchaseIntelligencePage() {
    const { recommendations, isLoading, error, refresh, onAccept, onIgnore } = usePurchaseRecommendations();
    return (
        <div className="px-4 sm:px-6 lg:px-8 py-8">
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-2xl font-semibold leading-6 text-gray-900">Inteligencia de Compras</h1>
                    <p className="mt-2 text-sm text-gray-700">
                        Analiza tus costos y detecta oportunidades de ahorro basadas en tu historial real y el mercado.
                    </p>
                </div>
                <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
                    <button
                        type="button"
                        onClick={refresh}
                        className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        {isLoading ? 'Cargando...' : 'Actualizar Análisis'}
                    </button>
                </div>
            </div>

            <div className="mt-8">
                <SavingsKPICard {...KPI_DATA} />
            </div>

            <div className="mt-8">
                <h2 className="text-lg font-medium leading-6 text-gray-900 mb-4">Oportunidades de Ahorro Detectadas</h2>
                {error && <p className="text-red-500">Error al cargar datos: {error}</p>}
                {!isLoading && !error && (
                    <PriceComparisonTable
                        recommendations={recommendations}
                        onAccept={onAccept}
                        onIgnore={onIgnore}
                    />
                )}
            </div>
        </div>
    );
}
