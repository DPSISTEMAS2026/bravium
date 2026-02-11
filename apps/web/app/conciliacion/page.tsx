"use client";

import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckCircleIcon, DocumentTextIcon, CurrencyDollarIcon, LinkIcon } from '@heroicons/react/24/outline';

interface DashboardData {
    period: {
        from: string;
        to: string;
    };
    summary: {
        transactions: {
            total: number;
            matched: number;
            pending: number;
            match_rate: string;
            total_amount: number;
        };
        dtes: {
            total: number;
            paid: number;
            unpaid: number;
            partially_paid: number;
            payment_rate: string;
            total_amount: number;
            outstanding_amount: number;
        };
        matches: {
            total: number;
            confirmed: number;
            draft: number;
            automatic: number;
            manual: number;
            auto_rate: string;
        };
    };
    pending: {
        transactions: any[];
        dtes: any[];
    };
    recent_matches: any[];
    insights: {
        top_providers: any[];
        high_value_unmatched: {
            transactions: any[];
            dtes: any[];
        };
    };
}

export default function ConciliacionPage() {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState({
        from: '2026-01-01',
        to: '2026-01-31'
    });

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const fetchDashboard = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                fromDate: dateRange.from,
                toDate: dateRange.to
            });

            const response = await fetch(`${API_URL}/conciliacion/dashboard?${params}`);

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            setDashboardData(data);
        } catch (err: any) {
            setError(err.message || 'Error al cargar el dashboard');
            console.error('Dashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    const runAutoMatch = async () => {
        try {
            const response = await fetch(`${API_URL}/conciliacion/run-auto-match`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fromDate: dateRange.from,
                    toDate: dateRange.to
                })
            });

            if (!response.ok) {
                throw new Error('Error al ejecutar auto-match');
            }

            await fetchDashboard();
            alert('Auto-match ejecutado exitosamente');
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-CL', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="flex items-center justify-center h-96">
                    <div className="text-center">
                        <ArrowPathIcon className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600">Cargando dashboard...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                    <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                            <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-red-800">Error al cargar el dashboard</h3>
                            <p className="text-red-600 text-sm mt-1">{error}</p>
                            <button
                                onClick={fetchDashboard}
                                className="mt-3 text-sm text-red-700 hover:text-red-800 font-medium"
                            >
                                Reintentar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!dashboardData) {
        return null;
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard de Conciliación</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Período: {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={fetchDashboard}
                        className="flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                        <ArrowPathIcon className="h-4 w-4 mr-2" />
                        Actualizar
                    </button>
                    <button
                        onClick={runAutoMatch}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                        Ejecutar Auto-Match
                    </button>
                </div>
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                {/* Transacciones */}
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 p-6 shadow-sm border border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <CurrencyDollarIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded">
                            {dashboardData.summary.transactions.match_rate}
                        </span>
                    </div>
                    <div className="text-3xl font-bold text-blue-900 mb-1">
                        {dashboardData.summary.transactions.total}
                    </div>
                    <div className="text-sm text-blue-700 mb-2">Transacciones Bancarias</div>
                    <div className="text-xs text-blue-600 space-y-1">
                        <div>✓ Matched: {dashboardData.summary.transactions.matched}</div>
                        <div>⏳ Pending: {dashboardData.summary.transactions.pending}</div>
                    </div>
                </div>

                {/* DTEs */}
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 p-6 shadow-sm border border-purple-200">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <DocumentTextIcon className="h-6 w-6 text-purple-600" />
                        </div>
                        <span className="text-xs font-semibold text-purple-700 bg-purple-200 px-2 py-1 rounded">
                            {dashboardData.summary.dtes.payment_rate}
                        </span>
                    </div>
                    <div className="text-3xl font-bold text-purple-900 mb-1">
                        {dashboardData.summary.dtes.total}
                    </div>
                    <div className="text-sm text-purple-700 mb-2">DTEs (Facturas)</div>
                    <div className="text-xs text-purple-600 space-y-1">
                        <div>✓ Pagados: {dashboardData.summary.dtes.paid}</div>
                        <div>⏳ Pendientes: {dashboardData.summary.dtes.unpaid}</div>
                    </div>
                </div>

                {/* Matches */}
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 shadow-sm border border-emerald-200">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                            <LinkIcon className="h-6 w-6 text-emerald-600" />
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded">
                            {dashboardData.summary.matches.auto_rate}
                        </span>
                    </div>
                    <div className="text-3xl font-bold text-emerald-900 mb-1">
                        {dashboardData.summary.matches.total}
                    </div>
                    <div className="text-sm text-emerald-700 mb-2">Matches Totales</div>
                    <div className="text-xs text-emerald-600 space-y-1">
                        <div>🤖 Automáticos: {dashboardData.summary.matches.automatic}</div>
                        <div>👤 Manuales: {dashboardData.summary.matches.manual}</div>
                    </div>
                </div>

                {/* Monto Pendiente */}
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 p-6 shadow-sm border border-amber-200">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <span className="text-2xl">💰</span>
                        </div>
                        <span className="text-xs font-semibold text-amber-700 bg-amber-200 px-2 py-1 rounded">
                            Pendiente
                        </span>
                    </div>
                    <div className="text-2xl font-bold text-amber-900 mb-1">
                        {formatCurrency(dashboardData.summary.dtes.outstanding_amount)}
                    </div>
                    <div className="text-sm text-amber-700 mb-2">Monto por Pagar</div>
                    <div className="text-xs text-amber-600">
                        De {formatCurrency(dashboardData.summary.dtes.total_amount)} total
                    </div>
                </div>
            </div>

            {/* Pending Transactions */}
            {dashboardData.pending.transactions.length > 0 && (
                <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-medium text-gray-900">Transacciones Pendientes de Conciliar</h3>
                        <p className="text-sm text-gray-500 mt-1">Top {dashboardData.pending.transactions.length} por monto</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-gray-900">Fecha</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Descripción</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Banco</th>
                                    <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Monto</th>
                                    <th className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Tipo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {dashboardData.pending.transactions.map((tx: any) => (
                                    <tr key={tx.id} className="hover:bg-blue-50">
                                        <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm text-gray-600">
                                            {formatDate(tx.date)}
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-900">
                                            {tx.description}
                                            {tx.reference && (
                                                <div className="text-xs text-gray-500">Ref: {tx.reference}</div>
                                            )}
                                        </td>
                                        <td className="px-3 py-4 text-sm text-gray-600">
                                            {tx.bankAccount?.bankName || 'N/A'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium">
                                            <span className={tx.type === 'DEBIT' ? 'text-red-600' : 'text-green-600'}>
                                                {tx.type === 'DEBIT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${tx.type === 'DEBIT' ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-green-50 text-green-700 ring-green-600/20'
                                                }`}>
                                                {tx.type === 'DEBIT' ? 'Cargo' : 'Abono'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pending DTEs */}
            {dashboardData.pending.dtes.length > 0 && (
                <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-medium text-gray-900">DTEs Pendientes de Pago</h3>
                        <p className="text-sm text-gray-500 mt-1">Top {dashboardData.pending.dtes.length} por monto pendiente</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-300">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-gray-900">Folio</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Proveedor</th>
                                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Fecha Emisión</th>
                                    <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Monto Total</th>
                                    <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Pendiente</th>
                                    <th className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900">Tipo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {dashboardData.pending.dtes.map((dte: any) => (
                                    <tr key={dte.id} className="hover:bg-purple-50">
                                        <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-mono text-gray-900">
                                            {dte.folio}
                                        </td>
                                        <td className="px-3 py-4 text-sm">
                                            <div className="font-medium text-gray-900">
                                                {dte.provider?.name || 'Sin proveedor'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                RUT: {dte.provider?.rut || dte.rutIssuer}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600">
                                            {formatDate(dte.issuedDate)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900">
                                            {formatCurrency(dte.totalAmount)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                                            <span className="font-bold text-red-600">
                                                {formatCurrency(dte.outstandingAmount)}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                                                {dte.type === 33 ? 'Factura' : dte.type === 61 ? 'N. Crédito' : `Tipo ${dte.type}`}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Top Providers */}
            {dashboardData.insights.top_providers.length > 0 && (
                <div className="bg-white shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-medium text-gray-900">Top Proveedores por Deuda Pendiente</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {dashboardData.insights.top_providers.map((prov: any, idx: number) => (
                                <div key={prov.provider.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div className="font-medium text-gray-900">{prov.provider.name}</div>
                                            <div className="text-xs text-gray-500">
                                                RUT: {prov.provider.rut} • {prov.dte_count} DTEs
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-red-600">{formatCurrency(prov.total_outstanding)}</div>
                                        <div className="text-xs text-gray-500">de {formatCurrency(prov.total_amount)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
