'use client';

import { useState, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    ClockIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';

interface DTE {
    id: string;
    folio: number;
    type: number;
    rutIssuer: string;
    totalAmount: number;
    outstandingAmount: number;
    issuedDate: string;
    paymentStatus: string;
    provider: {
        id: string;
        rut: string;
        name: string;
    } | null;
    hasMatch: boolean;
    matchCount: number;
}

interface DTESummary {
    total: number;
    totalAmount: number;
    totalOutstanding: number;
    paidAmount: number;
    paymentRate: number;
    byStatus: {
        UNPAID: number;
        PARTIAL: number;
        PAID: number;
        OVERPAID: number;
    };
    matched: number;
    unmatched: number;
}

export default function FacturasPage() {
    const [dtes, setDtes] = useState<DTE[]>([]);
    const [summary, setSummary] = useState<DTESummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadDTEs();
    }, []);

    const loadDTEs = async () => {
        try {
            setLoading(true);
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

            const [dtesRes, summaryRes] = await Promise.all([
                fetch(`${API_URL}/dtes?fromDate=2026-01-01&toDate=2026-01-31`),
                fetch(`${API_URL}/dtes/summary?fromDate=2026-01-01&toDate=2026-01-31`),
            ]);

            const [dtesData, summaryData] = await Promise.all([
                dtesRes.json(),
                summaryRes.json(),
            ]);

            setDtes(dtesData);
            setSummary(summaryData);
        } catch (error) {
            console.error('Error loading DTEs:', error);
        } finally {
            setLoading(false);
        }
    };

    const syncLibreDTE = async () => {
        try {
            setSyncing(true);
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
            await fetch(`${API_URL}/ingestion/libredte/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate: '2026-01-01',
                    toDate: '2026-01-31',
                }),
            });
            await loadDTEs();
            alert('Sincronización completada exitosamente');
        } catch (error) {
            console.error('Error syncing:', error);
            alert('Error al sincronizar con LibreDTE');
        } finally {
            setSyncing(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    const getDocumentTypeName = (type: number) => {
        const types: Record<number, string> = {
            33: 'Factura',
            34: 'Factura Exenta',
            61: 'Nota de Crédito',
            56: 'Nota de Débito',
        };
        return types[type] || `Tipo ${type}`;
    };

    const filteredDTEs = dtes.filter((dte) => {
        const matchesSearch =
            dte.folio.toString().includes(search) ||
            dte.provider?.name.toLowerCase().includes(search.toLowerCase()) ||
            dte.provider?.rut.includes(search);

        const matchesStatus =
            statusFilter === 'ALL' || dte.paymentStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">Cargando facturas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">
                        Facturas (DTEs)
                    </h1>
                    <p className="text-slate-600 mt-1">
                        Sincronizado automáticamente con LibreDTE
                    </p>
                </div>
                <button
                    onClick={syncLibreDTE}
                    disabled={syncing}
                    className="btn-primary flex items-center space-x-2"
                >
                    <ArrowPathIcon
                        className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`}
                    />
                    <span>{syncing ? 'Sincronizando...' : 'Sincronizar LibreDTE'}</span>
                </button>
            </div>

            {/* Stats Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="card p-5 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                        <div className="text-3xl font-bold text-purple-900 mb-1">
                            {summary.total}
                        </div>
                        <div className="text-sm text-purple-700 font-medium">
                            Total DTEs
                        </div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
                        <div className="text-3xl font-bold text-green-900 mb-1">
                            {summary.byStatus.PAID}
                        </div>
                        <div className="text-sm text-green-700 font-medium">Pagadas</div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200">
                        <div className="text-3xl font-bold text-amber-900 mb-1">
                            {summary.byStatus.UNPAID}
                        </div>
                        <div className="text-sm text-amber-700 font-medium">
                            Pendientes
                        </div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                        <div className="text-2xl font-bold text-blue-900 mb-1">
                            {formatCurrency(summary.totalAmount)}
                        </div>
                        <div className="text-sm text-blue-700 font-medium">
                            Monto Total
                        </div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                        <div className="text-2xl font-bold text-red-900 mb-1">
                            {formatCurrency(summary.totalOutstanding)}
                        </div>
                        <div className="text-sm text-red-700 font-medium">
                            Por Pagar
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por folio, proveedor o RUT..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <FunnelIcon className="h-5 w-5 text-slate-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="UNPAID">Pendientes</option>
                            <option value="PARTIAL">Parcialmente Pagadas</option>
                            <option value="PAID">Pagadas</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gradient-to-r from-purple-50 to-purple-100 text-purple-900 font-semibold border-b-2 border-purple-200">
                            <tr>
                                <th className="px-6 py-4">Folio</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4">Fecha Emisión</th>
                                <th className="px-6 py-4 text-right">Monto Total</th>
                                <th className="px-6 py-4 text-right">Pendiente</th>
                                <th className="px-6 py-4 text-center">Estado Pago</th>
                                <th className="px-6 py-4 text-center">Conciliación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredDTEs.map((dte) => (
                                <tr
                                    key={dte.id}
                                    className="hover:bg-purple-50/30 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4">
                                        <span className="font-mono font-bold text-slate-900">
                                            {dte.folio}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                            {getDocumentTypeName(dte.type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">
                                            {dte.provider?.name || 'Sin proveedor'}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">
                                            {dte.provider?.rut || dte.rutIssuer}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-600">
                                        {formatDate(dte.issuedDate)}
                                    </td>
                                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                                        {formatCurrency(dte.totalAmount)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span
                                            className={`font-bold ${dte.outstandingAmount > 0
                                                ? 'text-red-600'
                                                : 'text-slate-400'
                                                }`}
                                        >
                                            {formatCurrency(dte.outstandingAmount)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {dte.paymentStatus === 'PAID' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                Pagada
                                            </span>
                                        )}
                                        {dte.paymentStatus === 'UNPAID' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                                                <XCircleIcon className="h-4 w-4 mr-1" />
                                                Pendiente
                                            </span>
                                        )}
                                        {dte.paymentStatus === 'PARTIAL' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                                <ClockIcon className="h-4 w-4 mr-1" />
                                                Parcial
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {dte.hasMatch ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                {dte.matchCount} match{dte.matchCount > 1 ? 'es' : ''}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">
                                                Sin match
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredDTEs.length === 0 && (
                    <div className="text-center py-12">
                        <DocumentTextIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">
                            No se encontraron facturas
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                            Intenta ajustar los filtros de búsqueda
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
