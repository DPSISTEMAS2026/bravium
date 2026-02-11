'use client';

import { useState, useEffect } from 'react';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon, CurrencyDollarIcon, DocumentTextIcon, LinkIcon } from '@heroicons/react/24/solid';

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

    const fetchDashboard = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                fromDate: dateRange.from,
                toDate: dateRange.to
            });

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/conciliacion/dashboard?${params}`);

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
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/conciliacion/run-auto-match`, {
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

            // Recargar dashboard
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
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <ArrowPathIcon className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-center space-x-3">
                    <XCircleIcon className="h-8 w-8 text-red-500" />
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
        );
    }

    if (!dashboardData) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Dashboard de Conciliación</h1>
                    <p className="text-slate-500 mt-1">
                        Período: {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={fetchDashboard}
                        className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm flex items-center space-x-2"
                    >
                        <ArrowPathIcon className="h-4 w-4" />
                        <span>Actualizar</span>
                    </button>
                    <button
                        onClick={runAutoMatch}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-emerald-600/20"
                    >
                        Ejecutar Auto-Match
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Transacciones */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <CurrencyDollarIcon className="h-8 w-8 text-blue-600" />
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
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <DocumentTextIcon className="h-8 w-8 text-purple-600" />
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
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <LinkIcon className="h-8 w-8 text-emerald-600" />
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
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">💰</span>
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
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-700">Transacciones Pendientes de Conciliar</h3>
                        <p className="text-xs text-slate-500 mt-1">Top {dashboardData.pending.transactions.length} por monto</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="px-6 py-3 text-left">Fecha</th>
                                    <th className="px-6 py-3 text-left">Descripción</th>
                                    <th className="px-6 py-3 text-left">Banco</th>
                                    <th className="px-6 py-3 text-right">Monto</th>
                                    <th className="px-6 py-3 text-center">Tipo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dashboardData.pending.transactions.map((tx: any, idx: number) => (
                                    <tr key={tx.id} className="hover:bg-blue-50/30">
                                        <td className="px-6 py-4 text-slate-600">
                                            {formatDate(tx.date)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">{tx.description}</div>
                                            {tx.reference && (
                                                <div className="text-xs text-slate-500">Ref: {tx.reference}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {tx.bankAccount?.bankName || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-bold ${tx.type === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                                                {tx.type === 'DEBIT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${tx.type === 'DEBIT' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
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
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-700">DTEs Pendientes de Pago</h3>
                        <p className="text-xs text-slate-500 mt-1">Top {dashboardData.pending.dtes.length} por monto pendiente</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 font-medium">
                                <tr>
                                    <th className="px-6 py-3 text-left">Folio</th>
                                    <th className="px-6 py-3 text-left">Proveedor</th>
                                    <th className="px-6 py-3 text-left">Fecha Emisión</th>
                                    <th className="px-6 py-3 text-right">Monto Total</th>
                                    <th className="px-6 py-3 text-right">Pendiente</th>
                                    <th className="px-6 py-3 text-center">Tipo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {dashboardData.pending.dtes.map((dte: any) => (
                                    <tr key={dte.id} className="hover:bg-purple-50/30">
                                        <td className="px-6 py-4 font-mono text-slate-900">
                                            {dte.folio}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-slate-900">
                                                {dte.provider?.name || 'Sin proveedor'}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                RUT: {dte.provider?.rut || dte.rutIssuer}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {formatDate(dte.issuedDate)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900">
                                            {formatCurrency(dte.totalAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-bold text-red-600">
                                                {formatCurrency(dte.outstandingAmount)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
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

            {/* Recent Matches */}
            {dashboardData.recent_matches.length > 0 && (
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-700">Matches Recientes</h3>
                        <p className="text-xs text-slate-500 mt-1">Últimos {dashboardData.recent_matches.length} matches creados</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {dashboardData.recent_matches.map((match: any) => (
                            <div key={match.id} className="px-6 py-4 hover:bg-emerald-50/30">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-2">
                                            <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${match.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {match.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador'}
                                            </span>
                                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                                {match.origin === 'AUTOMATIC' ? '🤖 Auto' : '👤 Manual'}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                Confianza: {(match.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <div className="text-xs text-slate-500 mb-1">Transacción</div>
                                                <div className="font-medium text-slate-900">{match.transaction.description}</div>
                                                <div className="text-xs text-slate-600">
                                                    {formatDate(match.transaction.date)} • {formatCurrency(match.transaction.amount)}
                                                </div>
                                            </div>
                                            {match.dte && (
                                                <div>
                                                    <div className="text-xs text-slate-500 mb-1">DTE</div>
                                                    <div className="font-medium text-slate-900">
                                                        Folio {match.dte.folio} - {match.dte.provider?.name}
                                                    </div>
                                                    <div className="text-xs text-slate-600">
                                                        Tipo {match.dte.type} • {formatCurrency(match.dte.totalAmount)}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-400">
                                        {new Date(match.createdAt).toLocaleString('es-CL')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Providers */}
            {dashboardData.insights.top_providers.length > 0 && (
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-700">Top Proveedores por Deuda Pendiente</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {dashboardData.insights.top_providers.map((prov: any, idx: number) => (
                                <div key={prov.provider.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{prov.provider.name}</div>
                                            <div className="text-xs text-slate-500">
                                                RUT: {prov.provider.rut} • {prov.dte_count} DTEs
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-red-600">{formatCurrency(prov.total_outstanding)}</div>
                                        <div className="text-xs text-slate-500">de {formatCurrency(prov.total_amount)}</div>
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
