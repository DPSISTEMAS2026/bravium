'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ChartBarIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ClockIcon,
    BanknotesIcon,
    ArrowDownTrayIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '@/lib/api';
import Link from 'next/link';

interface Provider {
    id: string;
    rut: string;
    name: string;
    category: string | null;
    totalDebt: number;
    totalInvoiced: number;
    paidAmount: number;
    paymentRate: string;
    invoiceCount: number;
    unpaidInvoices: number;
    overdueInvoices: number;
    status: 'CRITICAL_10' | 'CRITICAL_30' | 'WITH_DEBT' | 'OK';
}

interface PaginatedResponse {
    data: Provider[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const PAGE_SIZE = 20;

export default function ProveedoresPage() {
    const API_URL = getApiUrl();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [selectedYear, setSelectedYear] = useState('2026');
    const [page, setPage] = useState(1);

    const { data: response, isLoading: loading } = useSWR<PaginatedResponse>(
        `${API_URL}/proveedores?page=${page}&limit=${PAGE_SIZE}&year=${selectedYear}${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`
    );

    useEffect(() => {
        setPage(1);
    }, [search, selectedYear, statusFilter]);

    const providers = response?.data ?? [];
    const total = response?.total ?? 0;
    const totalPages = Math.max(1, response?.totalPages ?? 1);
    const currentPage = Math.min(page, totalPages);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    // El backend ya filtra por estado si se lo pasamos, por lo que filteredProviders es simplemente providers
    const filteredProviders = providers;

    const stats = useMemo(() => ({
        total,
        conDeuda: providers.filter((p) => p.totalDebt > 0).length,
        deudaTotal: providers.reduce((sum, p) => sum + p.totalDebt, 0),
        critical: providers.filter((p) => p.status === 'CRITICAL_30' || p.status === 'CRITICAL_10').length,
    }), [total, providers]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">Cargando proveedores...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Proveedores</h1>
                    <p className="text-slate-600 mt-1">
                        Gestión de saldos y deuda histórica
                    </p>
                </div>
                <button
                    onClick={async () => {
                        try {
                            const API_URL = getApiUrl();
                            const res = await fetch(`${API_URL}/proveedores/export/pago-masivo`);
                            if (!res.ok) throw new Error('Error al exportar');
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `pago_masivo_${new Date().toISOString().split('T')[0]}.xlsx`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(url);
                        } catch (err) {
                            alert('Error al exportar pago masivo');
                        }
                    }}
                    className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all transform hover:scale-105 text-sm"
                >
                    <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                    Exportar Pago Masivo
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-slate-100 p-3 rounded-xl text-slate-600">
                        <ChartBarIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Registrados</div>
                    </div>
                </div>

                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600">
                        <ExclamationTriangleIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-indigo-900">{stats.conDeuda}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Con Deuda (pág.)</div>
                    </div>
                </div>

                <div className="card-glass p-5 flex items-center space-x-4 border-2 border-indigo-100">
                    <div className="bg-indigo-600 p-3 rounded-xl text-white">
                        <BanknotesIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-indigo-900">{formatCurrency(stats.deudaTotal)}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Deuda (pág.)</div>
                    </div>
                </div>

                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-red-50 p-3 rounded-xl text-red-500">
                        <ExclamationTriangleIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Crítico (pág.)</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <FunnelIcon className="h-5 w-5 text-slate-400" />
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="2026">2026</option>
                            <option value="2025">2025</option>
                            <option value="2024">2024</option>
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Cualquier Estado ({total})</option>
                            <option value="PENDING">Pendientes (Con Deuda)</option>
                            <option value="WITH_DEBT">Con Deuda Corriente</option>
                            <option value="CRITICAL_10">Vencido +10 días</option>
                            <option value="CRITICAL_30">Vencido +30 días (Crítico)</option>
                            <option value="OK">Al día</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-tight text-[11px]">
                            <tr>
                                <th className="px-6 py-4">Proveedor / RUT</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-right">Facturado</th>
                                <th className="px-6 py-4 text-right">Pagado</th>
                                <th className="px-6 py-4 text-right">Deuda Pendiente</th>
                                <th className="px-6 py-4 text-center">Docs</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProviders.map((provider) => (
                                <tr
                                    key={provider.id}
                                    className="hover:bg-blue-50/50 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">
                                            {provider.name}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">
                                            {provider.rut}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {provider.category ? (
                                            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                                {provider.category}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">
                                                Sin categoría
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-slate-700">
                                        {formatCurrency(provider.totalInvoiced)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-green-700 font-semibold">
                                            {formatCurrency(provider.paidAmount)}
                                        </span>
                                        <div className="text-xs text-slate-500">
                                            {provider.paymentRate}% pagado
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span
                                            className={`font-bold ${provider.totalDebt > 0
                                                ? 'text-red-600'
                                                : 'text-slate-400'
                                                }`}
                                        >
                                            {formatCurrency(provider.totalDebt)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-slate-900 font-medium">
                                            {provider.invoiceCount}
                                        </div>
                                        {provider.unpaidInvoices > 0 && (
                                            <div className="text-xs text-amber-600">
                                                {provider.unpaidInvoices} pendientes
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {provider.status === 'CRITICAL_30' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 border border-red-200">
                                                <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                                                Crítico +30d
                                            </span>
                                        )}
                                        {provider.status === 'CRITICAL_10' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                                <ClockIcon className="h-4 w-4 mr-1" />
                                                Vencido +10d
                                            </span>
                                        )}
                                        {provider.status === 'WITH_DEBT' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                                                <BanknotesIcon className="h-4 w-4 mr-1" />
                                                Deuda corriente
                                            </span>
                                        )}
                                        {provider.status === 'OK' && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                Al día
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/proveedores/${provider.id}`}
                                            className="text-indigo-600 font-bold hover:text-indigo-900 transition-colors uppercase text-[10px] tracking-widest bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100"
                                        >
                                            Ver Detalle
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredProviders.length === 0 && (
                    <div className="text-center py-12">
                        <ChartBarIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">
                            No se encontraron proveedores
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                            {total === 0 ? 'No hay proveedores registrados' : 'Intenta ajustar los filtros de búsqueda'}
                        </p>
                    </div>
                )}

                {/* Paginación */}
                {total > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-sm text-slate-600">
                            Mostrando <span className="font-semibold">{(currentPage - 1) * PAGE_SIZE + 1}</span>
                            {' – '}
                            <span className="font-semibold">{Math.min(currentPage * PAGE_SIZE, total)}</span>
                            {' de '}
                            <span className="font-semibold">{total}</span> proveedores
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                aria-label="Página anterior"
                            >
                                <ChevronLeftIcon className="h-5 w-5" />
                            </button>
                            <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                                aria-label="Página siguiente"
                            >
                                <ChevronRightIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
