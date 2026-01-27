import { ArrowDownIcon, ArrowUpIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface SavingsKPIProps {
    potentialMonthlySaving: number;
    potentialAnnualSaving: number;
    overpricedProductCount: number;
}

export function SavingsKPICard({
    potentialMonthlySaving,
    potentialAnnualSaving,
    overpricedProductCount
}: SavingsKPIProps) {
    return (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Monthly Saving */}
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-md bg-green-100 p-3">
                        <ArrowDownIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                        <dt className="truncate text-sm font-medium text-gray-500">Ahorro Potencial Mensual</dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                            ${potentialMonthlySaving.toLocaleString('es-CL')}
                        </dd>
                        <div className="mt-2 text-sm text-green-600">
                            <span className="font-medium">Identificado en {overpricedProductCount} productos</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Annual Projection */}
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-md bg-blue-100 p-3">
                        <CurrencyDollarIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                        <dt className="truncate text-sm font-medium text-gray-500">Proyección Anual</dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                            ${potentialAnnualSaving.toLocaleString('es-CL')}
                        </dd>
                        <div className="mt-2 text-sm text-gray-500">
                            <span className="font-medium">Basado en consumo histórico</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alerts */}
            <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-md bg-red-100 p-3">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                        <dt className="truncate text-sm font-medium text-gray-500">Alertas de Costo</dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                            {overpricedProductCount}
                        </dd>
                        <div className="mt-2 text-sm text-red-600">
                            <span className="font-medium">Requieren atención inmediata</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
