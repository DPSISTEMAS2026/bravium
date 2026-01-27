
"use client";

import { ShoppingBagIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const mockupProducts = [
    {
        id: 1,
        name: 'Notebook Dell Latitude 5420',
        category: 'Tecnología',
        lastPrice: 850000,
        marketPrice: 820000,
        variance: 3.65,
        status: 'OVERPRICE', // Pags más de lo debido
        supplier: 'PC Factory',
        recommended: 'Wei Chile ($820.000)'
    },
    {
        id: 2,
        name: 'Licencia Microsoft 365 Business',
        category: 'Software',
        lastPrice: 12000,
        marketPrice: 14500,
        variance: -17.2,
        status: 'SAVING', // Ahorro
        supplier: 'Microsoft Direct',
        recommended: 'Mantener proveedor'
    },
    {
        id: 3,
        name: 'Escritorio Ergonómico Pro',
        category: 'Mobiliario',
        lastPrice: 200000,
        marketPrice: 195000,
        variance: 2.56,
        status: 'NEUTRAL',
        supplier: 'Muebles Sur',
        recommended: 'Sodimac ($195.000)'
    },
    {
        id: 4,
        name: 'Servicio de Aseo Industrial (Mensual)',
        category: 'Servicios',
        lastPrice: 1500000,
        marketPrice: 1200000,
        variance: 25.0,
        status: 'CRITICAL_OVERPRICE',
        supplier: 'CleanCorp Spa',
        recommended: 'Limpieza Total Ltda ($1.200.000)'
    },
    {
        id: 5,
        name: 'Toner HP 105A',
        category: 'Insumos',
        lastPrice: 45000,
        marketPrice: 42000,
        variance: 7.1,
        status: 'OVERPRICE',
        supplier: 'Librería Nacional',
        recommended: 'Dimerc ($42.000)'
    }
];

export default function MonitorComprasPage() {
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Monitor de Compras</h1>
                <p className="text-sm text-gray-500">Comparativa de precios de mercado e inteligencia de abastecimiento.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
                <div className="bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center">
                        <div className="p-3 rounded-full bg-green-100 text-green-600">
                            <ArrowTrendingDownIcon className="h-6 w-6" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Ahorro Potencial Mensual</p>
                            <p className="text-2xl font-semibold text-gray-900">$355.000</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center">
                        <div className="p-3 rounded-full bg-red-100 text-red-600">
                            <ArrowTrendingUpIcon className="h-6 w-6" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Sobreprecio Detectado</p>
                            <p className="text-2xl font-semibold text-red-600">12.5%</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-center">
                        <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                            <ShoppingBagIcon className="h-6 w-6" />
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-500">Productos Monitoreados</p>
                            <p className="text-2xl font-semibold text-gray-900">5</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Producto</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Categoría</th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Último Precio</th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Precio Mercado</th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Variación</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Sugerencia</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {mockupProducts.map((product) => (
                            <tr key={product.id}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                    {product.name}
                                    <div className="block text-xs text-gray-500 font-normal">{product.supplier}</div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.category}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900">
                                    {formatCurrency(product.lastPrice)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-600">
                                    {formatCurrency(product.marketPrice)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                                    {product.variance > 0 ? (
                                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${product.status === 'CRITICAL_OVERPRICE' ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'}`}>
                                            +{product.variance}%
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                            {product.variance}%
                                        </span>
                                    )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {product.status === 'SAVING' ? (
                                        <div className="flex items-center text-green-600">
                                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                                            Excelente
                                        </div>
                                    ) : (
                                        <span className="text-indigo-600 font-medium cursor-pointer hover:underline">
                                            Ver: {product.recommended}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
