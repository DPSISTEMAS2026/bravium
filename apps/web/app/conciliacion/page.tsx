
"use client";

import { useState, useEffect } from 'react';

interface Transaction {
    id: string;
    date: string;
    amount: number;
    description: string;
    status: 'PENDING' | 'MATCHED' | 'PARTIALLY_MATCHED' | 'UNMATCHED';
    matches: {
        id: string;
        dte?: {
            totalAmount: number;
            provider?: { name: string };
        };
        payment?: {
            amount: number;
        };
        confidence: number;
    }[];
}

export default function ConciliacionPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('http://localhost:3001/conciliacion/overview');
            if (res.ok) {
                const data = await res.json();
                setTransactions(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString('es-CL');

    const getStatusBadge = (status: string, matches: Transaction['matches']) => {
        if (status === 'MATCHED' || (matches && matches.length > 0 && matches[0].confidence === 1)) {
            return <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">CONCILIADO</span>;
        }
        if (matches && matches.length > 0) {
            return <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">POSIBLE</span>;
        }
        return <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">SIN MATCH</span>;
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
                    <p className="text-sm text-gray-500">Revisión de movimientos bancarios vs DTEs</p>
                </div>
                <button
                    onClick={fetchData}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                    Refrescar
                </button>
            </div>

            <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Fecha</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Descripción Banco</th>
                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Monto</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contraparte (DTE/Prov)</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                                    Cargando movimientos...
                                </td>
                            </tr>
                        ) : transactions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                                    No hay movimientos registrados.
                                </td>
                            </tr>
                        ) : (
                            transactions.map((tx) => {
                                const match = tx.matches?.[0];
                                const providerName = match?.dte?.provider?.name || '---';

                                return (
                                    <tr key={tx.id}>
                                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                            {formatDate(tx.date)}
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-500 max-w-xs truncate" title={tx.description}>
                                            {tx.description}
                                        </td>
                                        <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(tx.amount)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {providerName}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {getStatusBadge(tx.status, tx.matches)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
