'use client';

import { useState, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    BanknotesIcon,
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    CheckCircleIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

interface BankTransaction {
    id: string;
    date: string;
    amount: number;
    description: string;
    reference: string | null;
    type: 'CREDIT' | 'DEBIT';
    status: string;
    bankAccount: {
        bankName: string;
        accountNumber: string;
    };
    hasMatch: boolean;
    matchCount: number;
    matches: any[];
}

interface TransactionSummary {
    total: number;
    totalDebits: number;
    totalCredits: number;
    netFlow: number;
    matched: number;
    unmatched: number;
    matchRate: number;
}

export default function PagosPage() {
    const [transactions, setTransactions] = useState<BankTransaction[]>([]);
    const [summary, setSummary] = useState<TransactionSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    useEffect(() => {
        loadTransactions();
    }, []);

    const loadTransactions = async () => {
        try {
            setLoading(true);
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

            const [txRes, summaryRes] = await Promise.all([
                fetch(`${API_URL}/transactions?fromDate=2026-01-01&toDate=2026-01-31`),
                fetch(`${API_URL}/transactions/summary?fromDate=2026-01-01&toDate=2026-01-31`),
            ]);

            const [txData, summaryData] = await Promise.all([
                txRes.json(),
                summaryRes.json(),
            ]);

            setTransactions(txData);
            setSummary(summaryData);
        } catch (error) {
            console.error('Error loading transactions:', error);
        } finally {
            setLoading(false);
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

    const filteredTransactions = transactions.filter((tx) => {
        const matchesSearch =
            tx.description.toLowerCase().includes(search.toLowerCase()) ||
            tx.reference?.toLowerCase().includes(search.toLowerCase());

        const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
        const matchesStatus = statusFilter === 'ALL' || tx.status === statusFilter;

        return matchesSearch && matchesType && matchesStatus;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">
                        Cargando transacciones...
                    </p>
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
                        Transacciones Bancarias
                    </h1>
                    <p className="text-slate-600 mt-1">
                        Movimientos desde cartolas bancarias
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="card p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                        <div className="text-3xl font-bold text-blue-900 mb-1">
                            {summary.total}
                        </div>
                        <div className="text-sm text-blue-700 font-medium">
                            Total Transacciones
                        </div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
                        <div className="flex items-center space-x-2 mb-1">
                            <ArrowTrendingUpIcon className="h-6 w-6 text-green-600" />
                            <div className="text-2xl font-bold text-green-900">
                                {formatCurrency(summary.totalCredits)}
                            </div>
                        </div>
                        <div className="text-sm text-green-700 font-medium">Ingresos</div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                        <div className="flex items-center space-x-2 mb-1">
                            <ArrowTrendingDownIcon className="h-6 w-6 text-red-600" />
                            <div className="text-2xl font-bold text-red-900">
                                {formatCurrency(summary.totalDebits)}
                            </div>
                        </div>
                        <div className="text-sm text-red-700 font-medium">Egresos</div>
                    </div>

                    <div
                        className={`card p-5 bg-gradient-to-br ${summary.netFlow >= 0
                            ? 'from-emerald-50 to-emerald-100 border-2 border-emerald-200'
                            : 'from-amber-50 to-amber-100 border-2 border-amber-200'
                            }`}
                    >
                        <div className="text-2xl font-bold mb-1"
                            style={{
                                color: summary.netFlow >= 0 ? '#065f46' : '#92400e',
                            }}
                        >
                            {formatCurrency(Math.abs(summary.netFlow))}
                        </div>
                        <div
                            className="text-sm font-medium"
                            style={{
                                color: summary.netFlow >= 0 ? '#059669' : '#d97706',
                            }}
                        >
                            Flujo Neto
                        </div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                        <div className="text-3xl font-bold text-purple-900 mb-1">
                            {summary.matchRate.toFixed(0)}%
                        </div>
                        <div className="text-sm text-purple-700 font-medium">
                            Tasa Conciliación
                        </div>
                        <div className="text-xs text-purple-600 mt-1">
                            {summary.matched} de {summary.total}
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
                            placeholder="Buscar por descripción o referencia..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <FunnelIcon className="h-5 w-5 text-slate-400" />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Todos los tipos</option>
                            <option value="CREDIT">Ingresos</option>
                            <option value="DEBIT">Egresos</option>
                        </select>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="PENDING">Pendientes</option>
                            <option value="MATCHED">Conciliadas</option>
                            <option value="UNMATCHED">Sin conciliar</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Descripción</th>
                                <th className="px-6 py-4">Banco / Cuenta</th>
                                <th className="px-6 py-4 text-right">Monto</th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-center">Conciliación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTransactions.map((tx) => (
                                <tr
                                    key={tx.id}
                                    className="hover:bg-blue-50/30 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4 text-slate-600 font-medium">
                                        {formatDate(tx.date)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">
                                            {tx.description}
                                        </div>
                                        {tx.reference && (
                                            <div className="text-xs text-slate-500 font-mono">
                                                Ref: {tx.reference}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-slate-900 font-medium">
                                            {tx.bankAccount.bankName}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">
                                            {tx.bankAccount.accountNumber}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span
                                            className={`font-bold text-lg ${tx.type === 'CREDIT'
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                                }`}
                                        >
                                            {tx.type === 'CREDIT' ? '+' : '-'}
                                            {formatCurrency(Math.abs(tx.amount))}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {tx.type === 'CREDIT' ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                                <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                                                Ingreso
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                                                <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                                                Egreso
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {tx.status === 'MATCHED' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                Conciliada
                                            </span>
                                        )}
                                        {tx.status === 'PENDING' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                                <ClockIcon className="h-4 w-4 mr-1" />
                                                Pendiente
                                            </span>
                                        )}
                                        {tx.status === 'UNMATCHED' && (
                                            <span className="text-slate-400 text-xs">
                                                Sin conciliar
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {tx.hasMatch ? (
                                            <div>
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                                    {tx.matchCount} match{tx.matchCount > 1 ? 'es' : ''}
                                                </span>
                                                {tx.matches[0]?.dte && (
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        DTE {tx.matches[0].dte.folio}
                                                    </div>
                                                )}
                                            </div>
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

                {filteredTransactions.length === 0 && (
                    <div className="text-center py-12">
                        <BanknotesIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">
                            No se encontraron transacciones
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
