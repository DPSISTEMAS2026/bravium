"use client";

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

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

interface IngestedFile {
    filename: string;
    bankName: string;
    count: number;
    pendingCount: number;
    minDate: string;
    maxDate: string;
    totalAmount: number;
}

export default function ConciliacionPage() {
    const [view, setView] = useState<'FILES' | 'DETAILS'>('FILES');
    const [files, setFiles] = useState<IngestedFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<IngestedFile | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // Fetch Files List
    // Fetch Files List
    const fetchFiles = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/files`);
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
            }
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    // Fetch Transactions for a specific file
    const fetchTransactions = useCallback(async (filename: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/overview?filename=${encodeURIComponent(filename)}`);
            if (res.ok) {
                const data = await res.json();
                setTransactions(data);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    useEffect(() => {
        if (view === 'FILES') {
            fetchFiles();
        } else if (view === 'DETAILS' && selectedFile) {
            fetchTransactions(selectedFile.filename);
        }
    }, [view, selectedFile, fetchFiles, fetchTransactions]);

    const handleSelectFile = (file: IngestedFile) => {
        setSelectedFile(file);
        setView('DETAILS');
    };

    const handleBack = () => {
        setSelectedFile(null);
        setView('FILES');
        setTransactions([]);
    };

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
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Conciliación</h1>
                    <p className="text-sm text-gray-500">Conciliación automática de facturas y pagos</p>
                </div>
                {view === 'DETAILS' && (
                    <button
                        onClick={handleBack}
                        className="flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                        <ArrowLeftIcon className="h-5 w-5 mr-2 text-gray-500" />
                        Volver
                    </button>
                )}
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <dt className="truncate text-xs font-bold text-gray-500 uppercase tracking-wide">FACTURAS SIN CONCILIAR</dt>
                        <div className="p-2 bg-yellow-50 rounded-lg flex items-center justify-center">
                            <DocumentTextIcon className="h-5 w-5 text-yellow-600" style={{ width: '20px', height: '20px' }} />
                        </div>
                    </div>
                    <dd className="mt-2 flex flex-col items-baseline">
                        <span className="text-2xl font-semibold text-gray-900">116</span>
                        <span className="text-sm text-gray-500 font-medium">$125.628.546</span>
                    </dd>
                </div>
                <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <dt className="truncate text-xs font-bold text-gray-500 uppercase tracking-wide">PAGOS SIN CONCILIAR</dt>
                        <div className="p-2 bg-blue-50 rounded-lg flex items-center justify-center">
                            <DocumentTextIcon className="h-5 w-5 text-blue-600" style={{ width: '20px', height: '20px' }} />
                        </div>
                    </div>
                    <dd className="mt-2 flex flex-col items-baseline">
                        <span className="text-2xl font-semibold text-gray-900">44</span>
                        <span className="text-sm text-gray-500 font-medium">$38.213.450</span>
                    </dd>
                </div>
                <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <dt className="truncate text-xs font-bold text-gray-500 uppercase tracking-wide">CONCILIADAS HOY</dt>
                        <div className="p-2 bg-green-50 rounded-lg flex items-center justify-center">
                            <DocumentTextIcon className="h-5 w-5 text-green-600" style={{ width: '20px', height: '20px' }} />
                        </div>
                    </div>
                    <dd className="mt-2 flex flex-col items-baseline">
                        <span className="text-2xl font-semibold text-gray-900">0</span>
                    </dd>
                </div>
                <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                        <dt className="truncate text-xs font-bold text-gray-500 uppercase tracking-wide">CON DIFERENCIAS</dt>
                        <div className="p-2 bg-red-50 rounded-lg flex items-center justify-center">
                            <DocumentTextIcon className="h-5 w-5 text-red-600" style={{ width: '20px', height: '20px' }} />
                        </div>
                    </div>
                    <dd className="mt-2 flex flex-col items-baseline">
                        <span className="text-2xl font-semibold text-gray-900">0</span>
                    </dd>
                </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between mb-8 p-1 bg-white rounded-lg border border-gray-200 w-fit">
                <button className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md shadow-sm">
                    Conciliación Automática
                </button>
                <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-transparent hover:bg-gray-50 rounded-md">
                    Conciliación Manual
                </button>
                <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-transparent hover:bg-gray-50 rounded-md">
                    Historial
                </button>
            </div>

            {view === 'FILES' && (
                <>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Cartolas Disponibles</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {isLoading ? (
                            <p className="text-gray-500">Cargando cartolas...</p>
                        ) : files.length === 0 ? (
                            <p className="text-gray-500">No hay cartolas cargadas. Ve a &quot;Cargar Cartola&quot; para subir una.</p>
                        ) : (
                            files.map((file) => (
                                <div
                                    key={file.filename}
                                    onClick={() => handleSelectFile(file)}
                                    className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400 cursor-pointer transition-all"
                                >
                                    <div className="flex-shrink-0">
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                            <DocumentTextIcon className="text-indigo-600" style={{ width: '24px', height: '24px' }} aria-hidden="true" />
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="absolute inset-0" aria-hidden="true" />
                                        <p className="text-sm font-medium text-gray-900">{file.filename}</p>
                                        <p className="truncate text-sm text-gray-500">{file.bankName} • {file.count} movim.</p>
                                        <div className="mt-1 flex items-center text-xs text-gray-400">
                                            {formatDate(file.minDate)} - {formatDate(file.maxDate)}
                                        </div>
                                    </div>
                                    <div>
                                        {file.pendingCount > 0 ? (
                                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                                {file.pendingCount} Pend.
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                                OK
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {view === 'DETAILS' && (
                <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Fecha</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Descripción Banco</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Monto</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Contraparte</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-10 text-center text-sm text-gray-500">Cargando movimientos...</td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-10 text-center text-sm text-gray-500">No se encontraron movimientos para este archivo.</td>
                                </tr>
                            ) : (
                                transactions.map((tx) => (
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
                                            {tx.matches?.[0]?.dte?.provider?.name || '---'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {getStatusBadge(tx.status, tx.matches)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
