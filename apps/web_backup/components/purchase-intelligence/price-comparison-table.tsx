import Link from 'next/link';
import { ConfidenceBadge } from './confidence-badge';

interface Recommendation {
    id: string;
    productName: string;
    currentProvider: string;
    currentPrice: number;
    recommendedPrice: number;
    savingPct: number;
    confidenceScore: number;
    explanation: string;
}

interface PriceComparisonTableProps {
    recommendations: Recommendation[];
    onAccept: (id: string) => void;
    onIgnore: (id: string) => void;
}

export function PriceComparisonTable({ recommendations, onAccept, onIgnore }: PriceComparisonTableProps) {
    return (
        <div className="mt-8 flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                                        Producto
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                        Proveedor Actual
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                        Precio vs. Recomendado
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                        Motivo
                                    </th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                        Confianza
                                    </th>
                                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                                        <span className="sr-only">Acciones</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {recommendations.map((rec) => (
                                    <tr key={rec.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                            {rec.productName}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {rec.currentProvider}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                                            <div className="flex flex-col">
                                                <span className="text-gray-900">${rec.currentPrice}</span>
                                                <span className="text-green-600 font-medium text-xs">
                                                    Sug: ${rec.recommendedPrice} (-{rec.savingPct.toFixed(1)}%)
                                                </span>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 max-w-xs truncate" title={rec.explanation}>
                                            {rec.explanation}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            <ConfidenceBadge score={rec.confidenceScore} />
                                        </td>
                                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => onAccept(rec.id)}
                                                    className="text-green-600 hover:text-green-900 border border-green-200 rounded px-2 py-1 text-xs"
                                                >
                                                    Aceptar
                                                </button>
                                                <button
                                                    onClick={() => onIgnore(rec.id)}
                                                    className="text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1 text-xs"
                                                >
                                                    Ignorar
                                                </button>
                                                <Link href={`/purchase-intelligence/product/${rec.id}`} className="text-indigo-600 hover:text-indigo-900 self-center ml-2">
                                                    Ver detalle
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
