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
import { Pagination } from '@/components/ui/Pagination';
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
    const [inputValue, setInputValue] = useState(''); // Estado para la escritura rápida
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [selectedYear, setSelectedYear] = useState('2026');
    const [selectedMonth, setSelectedMonth] = useState('ALL');
    const [page, setPage] = useState(1);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProviderName, setNewProviderName] = useState('');
    const [newProviderRut, setNewProviderRut] = useState('');
    const [newProviderCat, setNewProviderCat] = useState('');
    const [isCreating, setIsCreating] = useState(false);
 
    // Debounce de 500ms para el buscador
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(inputValue);
        }, 500);
        return () => clearTimeout(timer);
    }, [inputValue]);
 
    const { data: response, isLoading: loading, mutate } = useSWR<PaginatedResponse>(
        `${API_URL}/proveedores?page=${page}&limit=${PAGE_SIZE}&year=${selectedYear}&month=${selectedMonth}${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`
    );
 
    useEffect(() => {
        setPage(1);
    }, [search, selectedYear, selectedMonth, statusFilter]);

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

    const handleCreateProvider = async () => {
        if (!newProviderName.trim()) return;
        setIsCreating(true);
        try {
            const authFetch = (await import('@/lib/api')).authFetch;
            const res = await authFetch(`${API_URL}/proveedores`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newProviderName,
                    rut: newProviderRut,
                    category: newProviderCat
                })
            });
            if (!res.ok) throw new Error('Error al crear proveedor');
            alert('Proveedor creado exitosamente');
            setNewProviderName('');
            setNewProviderRut('');
            setNewProviderCat('');
            setIsCreateModalOpen(false);
            mutate();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsCreating(false);
        }
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
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center px-4 py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 transition-all text-sm"
                    >
                        + Nuevo Proveedor
                    </button>
                    <button
                        onClick={async () => {
                        try {
                            const API_URL = getApiUrl();
                            const authFetch = (await import('@/lib/api')).authFetch;
                            const res = await authFetch(`${API_URL}/proveedores/export/pago-masivo`);
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
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
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
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Todo el Año</option>
                            <option value="1">Enero</option>
                            <option value="2">Febrero</option>
                            <option value="3">Marzo</option>
                            <option value="4">Abril</option>
                            <option value="5">Mayo</option>
                            <option value="6">Junio</option>
                            <option value="7">Julio</option>
                            <option value="8">Agosto</option>
                            <option value="9">Septiembre</option>
                            <option value="10">Octubre</option>
                            <option value="11">Noviembre</option>
                            <option value="12">Diciembre</option>
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
                        <Pagination 
                                currentPage={currentPage} 
                                totalPages={totalPages} 
                                onPageChange={(p) => setPage(p)} 
                            />
                    </div>
                )}
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onMouseDown={() => setIsCreateModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onMouseDown={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Registrar Nuevo Proveedor</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Razón Social <span className="text-red-500">*</span></label>
                                <input value={newProviderName} onChange={e => setNewProviderName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej: Juan Pérez" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">RUT (Opcional)</label>
                                <input value={newProviderRut} onChange={e => setNewProviderRut(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Opcional. Ej: 12.345.678-9" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría (Opcional)</label>
                                <select value={newProviderCat} onChange={e => setNewProviderCat(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value="">Selecciona (Opcional)</option>
                                    <option value="HONORARIOS">HONORARIOS</option>
                                    <option value="SERVICIOS">SERVICIOS</option>
                                    <option value="INSUMOS">INSUMOS</option>
                                    <option value="LOGÍSTICA">LOGÍSTICA</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={handleCreateProvider} disabled={isCreating || !newProviderName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
                                {isCreating ? 'Guardando...' : 'Registrar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
