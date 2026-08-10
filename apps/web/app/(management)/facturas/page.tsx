'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useSearchParams } from 'next/navigation';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    ClockIcon,
    XCircleIcon,
    BanknotesIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, authFetch } from '@/lib/api';
import { Pagination } from '@/components/ui/Pagination';
// Import removed

const MONTHS = [
    { value: 'ALL', label: 'Todo el año' },
    { value: '01', label: 'Enero' },
    { value: '02', label: 'Febrero' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Mayo' },
    { value: '06', label: 'Junio' },
    { value: '07', label: 'Julio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
];

const YEARS = ['2025', '2026', '2024'];

interface DTEMatch {
    id: string;
    status: string;
    origin: string;
    confidence: number;
    ruleApplied?: string;
    notes?: string;
    transaction?: {
        id: string;
        date: string;
        amount: number;
        description: string;
        bankAccount?: { bankName: string; accountNumber: string };
    };
}

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
    matches?: DTEMatch[];
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
    const USE_NEW_MODAL = true; // Universal modal siempre activo
    const API_URL = getApiUrl();
    const searchParams = useSearchParams();
    const { mutate: globalMutate } = useSWRConfig();

    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [appliedSearch, setAppliedSearch] = useState(() => searchParams.get('search') || '');
    const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('paymentStatus') || searchParams.get('status') || 'ALL');
    const [syncing, setSyncing] = useState(false);
    const [page, setPage] = useState(1);
    const limit = 15;
    const [fromDate, setFromDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [reviewModal, setReviewModal] = useState<{ dte: DTE; match: DTEMatch } | null>(null);
    const [sortBy, setSortBy] = useState<string>('folio');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [hasPdfFilter, setHasPdfFilter] = useState<string>('ALL');
    
    // Modal Match Manual desde Facturas
    const [manualMatchDte, setManualMatchDte] = useState<DTE | null>(null);
    const [manualMatchSearch, setManualMatchSearch] = useState('');
    const [manualMatchTxResults, setManualMatchTxResults] = useState<any[]>([]);
    const [manualMatchSelectedTxIds, setManualMatchSelectedTxIds] = useState<string[]>([]);
    const [manualMatchLoading, setManualMatchLoading] = useState(false);
    const [manualMatchSaving, setManualMatchSaving] = useState(false);
    const [manualMatchError, setManualMatchError] = useState<string | null>(null);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);

    const queryStr = useMemo(() => {
        const params = new URLSearchParams({
            fromDate, 
            toDate,
            page: page.toString(), limit: limit.toString(),
            paymentStatus: statusFilter,
            search: appliedSearch || '',
            sortBy,
            sortOrder,
            hasPdf: hasPdfFilter,
        });
        return params.toString();
    }, [page, statusFilter, fromDate, toDate, appliedSearch, sortBy, sortOrder, hasPdfFilter]);

    const { data: dtesData, error: dtesError, isLoading: dtesLoading, isValidating: dtesValidating, mutate: mutateDtes } = useSWR(
        (statusFilter !== 'PAID') ? `${API_URL}/dtes?${queryStr}` : null,
        { keepPreviousData: false }
    );
    const { data: matchesData, error: matchesError, isLoading: matchesLoading, isValidating: matchesValidating, mutate: mutateMatches } = useSWR(
        statusFilter === 'PAID' ? `${API_URL}/dtes/conciliated-matches?fromDate=${fromDate}&toDate=${toDate}&page=${page}&limit=${limit}` : null,
        { keepPreviousData: false }
    );
    const { data: summary, error: summaryError, mutate: mutateSummary } = useSWR<DTESummary>(
        `${API_URL}/dtes/summary?fromDate=${fromDate}&toDate=${toDate}`,
        { keepPreviousData: false }
    );

    const dtes: DTE[] = dtesData?.data || dtesData || [];
    const meta = dtesData?.meta || null;

    const matchesResponse = matchesData as { data?: Array<{ matchId: string; transaction: any; dte: any; payment?: any }>; meta?: { total: number; page: number; limit: number; lastPage: number } } | undefined;
    const conciliatedRows: (DTE & { _rowKey?: string })[] = (matchesResponse?.data ?? [])
        .filter((row) => row.dte)
        .map((row) => ({
        ...row.dte,
        id: row.dte.id,
        _rowKey: row.matchId,
        paymentStatus: 'PAID',
        outstandingAmount: 0,
        hasMatch: true,
        matchCount: 1,
        isPdfAvailable: !!(row.dte.metadata && (row.dte.metadata as any)?.intercambio != null),
        matches: [{ id: row.matchId, status: 'CONFIRMED', origin: 'MANUAL', confidence: 1, transaction: row.transaction, payment: row.payment } as DTEMatch],
    }));
    const matchesMeta = matchesResponse?.meta || null;

    const displayDTEsSource = statusFilter === 'PAID' ? conciliatedRows : dtes;
    const displayMeta = statusFilter === 'PAID' ? matchesMeta : meta;
    const loading = statusFilter === 'PAID' ? (matchesLoading || matchesValidating) : (dtesLoading || dtesValidating);
    const apiError = dtesError || matchesError || summaryError;

    const refreshData = useCallback(() => { mutateDtes(); mutateSummary(); mutateMatches?.(); }, [mutateDtes, mutateSummary, mutateMatches]);
    
    useEffect(() => {
        if (reviewModal) {
            setReviewComment(reviewModal.match.notes || '');
        } else {
            setReviewComment('');
        }
    }, [reviewModal]);

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { setPage(1); setAppliedSearch(search); }
    };

    const handleMatchAction = async (status: 'CONFIRMED' | 'REJECTED') => {
        if (!reviewModal) return;
        setReviewLoading(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason: reviewComment || undefined }),
            });
            if (!res.ok) throw new Error('Error al actualizar');
            setReviewModal(null);
            setReviewComment('');
            refreshData();
            globalMutate((k: string) => typeof k === 'string' && (k.includes('/dtes') || k.includes('/conciliacion') || k.includes('/transactions')));
        } catch (err) {
            console.error(err);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleDiscardMatch = async () => {
        if (!reviewModal) return;
        setReviewLoading(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al descartar');
            setReviewModal(null);
            refreshData();
            globalMutate((k: string) => typeof k === 'string' && (k.includes('/dtes') || k.includes('/conciliacion') || k.includes('/transactions')));
        } catch (err) {
            console.error(err);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleUpdateNotes = async () => {
        if (!reviewModal) return;
        setReviewLoading(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}/notes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: reviewComment }),
            });
            if (!res.ok) throw new Error('Error al actualizar notas');
            setReviewModal(null);
            refreshData();
            if (typeof globalMutate === 'function') {
                globalMutate((k: string) => typeof k === 'string' && (k.includes('/dtes') || k.includes('/conciliacion') || k.includes('/transactions')));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setReviewLoading(false);
        }
    };

    const downloadPdf = async (id: string, type: number, folio: number) => {
        try {
            const API_URL = getApiUrl();
            const response = await authFetch(`${API_URL}/ingestion/libredte/pdf/${id}`);
            if (!response.ok) throw new Error('No se pudo obtener el PDF');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Factura_${folio}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert(
                'Error al descargar el PDF de LibreDTE. Es posible que el documento no tenga el intercambio completado.'
            );
        }
    };

    const syncLibreDTE = async () => {
        try {
            setSyncing(true);
            const API_URL = getApiUrl();

            await authFetch(`${API_URL}/ingestion/libredte/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate,
                    toDate,
                }),
            });
            refreshData();
            alert(`Sincronización completada.`);
        } catch (error) {
            console.error('Error syncing:', error);
            alert('Error al sincronizar con LibreDTE');
        } finally {
            setSyncing(false);
        }
    };

    const toggleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
        setPage(1);
    };

    const renderSortArrow = (field: string) => {
        if (sortBy !== field) return null;
        return (
            <span className="ml-1 inline-block">
                {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
        );
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

    const displayDTEs = displayDTEsSource;

    if (loading && !dtesData && !matchesData) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">Cargando facturas...</p>
                </div>
            </div>
        );
    }

    if (apiError) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center max-w-md p-6 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-red-800 font-medium mb-2">No se pudieron cargar las facturas</p>
                    <p className="text-sm text-red-600 mb-4">
                        Comprueba tu conexión a internet o que el servicio esté disponible y vuelve a intentarlo.
                    </p>
                    <button
                        type="button"
                        onClick={() => { refreshData(); }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">
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
            {summary != null && (
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
                            {summary.matched}
                        </div>
                        <div className="text-sm text-green-700 font-medium">Conciliados</div>
                    </div>

                    <div className="card p-5 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200">
                        <div className="text-3xl font-bold text-amber-900 mb-1">
                            {summary.unmatched}
                        </div>
                        <div className="text-sm text-amber-700 font-medium">Pendientes</div>
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
                <div className="flex flex-col lg:flex-row gap-4 items-end">
                    <div className="relative flex-1 w-full flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-500">Búsqueda rápida</label>
                        <div className="relative w-full">
                            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Folio, monto (con o sin puntos), RUT (con o sin DV)... Enter para filtrar"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={handleSearch}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm transition-all"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 w-full lg:w-auto items-end">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500">Desde</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-500">Hasta</label>
                                <button 
                                    onClick={() => {
                                        const now = new Date();
                                        const day = now.getDay();
                                        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                                        const monday = new Date(now.setDate(diff));
                                        
                                        const friday = new Date(monday);
                                        friday.setDate(monday.getDate() + 4);
                                        
                                        setFromDate(monday.toISOString().split('T')[0]);
                                        setToDate(friday.toISOString().split('T')[0]);
                                        setPage(1);
                                    }}
                                    className="text-[10px] text-indigo-600 font-bold hover:underline"
                                    title="Filtrar por Lunes a Viernes de esta semana"
                                >
                                    Semana Actual
                                </button>
                            </div>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500">Estado</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium bg-white"
                            >
                                <option value="ALL">Todos</option>
                                <option value="UNPAID">Pendientes</option>
                                <option value="PARTIAL">Parciales</option>
                                <option value="PAID">Pagadas</option>
                                <option value="ABONOS">📋 Abonos (NC)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500">DTE / PDF</label>
                            <select
                                value={hasPdfFilter}
                                onChange={(e) => { setHasPdfFilter(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium bg-white"
                            >
                                <option value="ALL">Todos</option>
                                <option value="YES">Con PDF</option>
                                <option value="NO">Sin PDF</option>
                            </select>
                        </div>

                        <button
                            onClick={() => { setPage(1); setAppliedSearch(search); }}
                            className="btn-primary py-2 text-sm w-full h-[38px] flex items-center justify-center font-bold"
                        >
                            Filtrar
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gradient-to-r from-purple-50 to-purple-100 text-purple-900 font-semibold border-b-2 border-purple-200">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => toggleSort('folio')}>Folio {renderSortArrow('folio')}</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4 cursor-pointer hover:text-purple-600 transition-colors" onClick={() => toggleSort('issuedDate')}>Fecha Emisión {renderSortArrow('issuedDate')}</th>
                                <th className="px-6 py-4 text-right cursor-pointer hover:text-purple-600 transition-colors" onClick={() => toggleSort('totalAmount')}>Monto Total {renderSortArrow('totalAmount')}</th>
                                <th className="px-6 py-4 text-right">Pendiente</th>
                                <th className="px-6 py-4 text-center">Estado Pago</th>
                                <th className="px-6 py-4 text-center">Conciliación</th>
                                <th className="px-6 py-4 text-right">PDF</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {displayDTEs.map((dte) => (
                                <tr
                                    key={(dte as any)._rowKey ?? dte.id}
                                    className="hover:bg-purple-50/30 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4">
                                        <span className="font-mono font-bold text-slate-900">
                                            {dte.folio}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                            dte.type === 61
                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                : 'bg-purple-100 text-purple-700'
                                        }`}>
                                            {getDocumentTypeName(dte.type)}
                                            {dte.type === 61 && ' (Abono)'}
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
                                    <td className={`px-6 py-4 text-right font-semibold ${dte.type === 61 ? 'text-emerald-600' : 'text-slate-900'}`}>
                                        {dte.type === 61 ? `-${formatCurrency(dte.totalAmount)}` : formatCurrency(dte.totalAmount)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {dte.type === 61 ? (
                                            <span className="font-bold text-emerald-600">
                                                Abono
                                            </span>
                                        ) : (
                                            <span
                                                className={`font-bold ${dte.outstandingAmount > 0
                                                    ? 'text-red-600'
                                                    : 'text-slate-400'
                                                    }`}
                                            >
                                                {formatCurrency(dte.outstandingAmount)}
                                            </span>
                                        )}
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
                                    <td className="px-6 py-4 text-center align-middle">
                                        {(() => {
                                            const match = dte.matches?.[0];
                                            const payment = (match as any)?.payment;
                                            const txDesc = match?.transaction?.description;
                                            const txAmount = match?.transaction?.amount;
                                            const txDate = match?.transaction?.date;
                                            const txBank = match?.transaction?.bankAccount?.bankName;
                                            const canOpen = match && (match.transaction || payment);

                                            const displayDesc = txDesc || (payment ? 'Carga Manual / Registro' : 'Transacción');
                                            const displayDate = txDate || payment?.date;
                                            const displayAmount = txAmount != null ? Math.abs(txAmount) : payment?.amount;

                                            if (match && match.status === 'CONFIRMED') {
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => canOpen && setReviewModal({ dte, match })}
                                                        className="flex flex-col items-center text-center w-full rounded-lg py-1 hover:bg-purple-50/80 transition-colors cursor-pointer border border-transparent hover:border-purple-200"
                                                        title="Ver / revisar match"
                                                    >
                                                        <span className="inline-flex items-center text-emerald-600 font-bold text-xs mb-1">
                                                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                            OK
                                                        </span>
                                                        <div className="text-[11px] text-slate-700 font-semibold leading-tight max-w-[180px] truncate" title={displayDesc}>
                                                            {displayDesc}
                                                        </div>
                                                        {displayDate && (
                                                            <div className="text-[10px] text-indigo-500 font-medium">
                                                                {formatDate(displayDate)} {txBank && `· ${txBank}`}
                                                            </div>
                                                        )}
                                                        {displayAmount != null && (
                                                            <div className="text-[10px] text-slate-400">
                                                                {formatCurrency(displayAmount)}
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            }
                                            if (match && match.status === 'DRAFT') {
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => canOpen && setReviewModal({ dte, match })}
                                                        className="flex flex-col items-center text-center w-full rounded-lg py-1 hover:bg-purple-50/80 transition-colors cursor-pointer border border-transparent hover:border-purple-200"
                                                        title="Revisar sugerencia de match"
                                                    >
                                                        <span className="inline-flex items-center text-blue-600 font-bold text-xs mb-1 ring-1 ring-blue-200 rounded px-2 py-0.5">
                                                            <ClockIcon className="h-3.5 w-3.5 mr-1" />
                                                            SUGERENCIA
                                                        </span>
                                                        <div className="text-[11px] text-slate-700 font-semibold leading-tight max-w-[180px] truncate" title={txDesc}>
                                                            {txDesc || 'Posible match'}
                                                        </div>
                                                        <div className="text-[10px] text-blue-500 font-medium">
                                                            Score: {(match.confidence * 100).toFixed(0)}%
                                                        </div>
                                                    </button>
                                                );
                                            }
                                            if ((dte as any).metadata && (dte as any).metadata.reconciliationComment) {
                                                const comment = (dte as any).metadata.reconciliationComment;
                                                return (
                                                    <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                                                        <span className="inline-flex items-center text-emerald-600 font-bold text-xs">
                                                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                            AMORTIZADO
                                                        </span>
                                                        <div className="text-[10px] text-slate-600 font-medium mt-1 text-center max-w-[150px] truncate" title={comment}>
                                                            {comment}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => { setManualMatchDte(dte); setManualMatchSearch(dte.provider?.name || ''); }}
                                                    className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-600 font-medium px-2 py-1 rounded hover:bg-slate-100/60 transition-colors group cursor-pointer"
                                                    title="Match manual"
                                                >
                                                    <span className="text-xs">Sin match</span>
                                                    <MagnifyingGlassIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {(dte as any).isPdfAvailable ? (
                                            <button
                                                onClick={() => downloadPdf(dte.id, dte.type, dte.folio)}
                                                className="p-2 hover:bg-purple-100 text-purple-600 rounded-lg transition-colors group"
                                                title="Descargar PDF"
                                            >
                                                <DocumentTextIcon className="h-6 w-6 group-hover:scale-110 transition-transform" />
                                            </button>
                                        ) : (
                                            <span className="text-slate-300 text-xs italic" title="XML no recibido en intercambio">
                                                No disponible
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {displayMeta && displayMeta.total > 0 && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            Mostrando <span className="font-semibold text-slate-700">{displayDTEs.length}</span> de <span className="font-semibold text-slate-700">{displayMeta.total}</span> {statusFilter === 'PAID' ? 'movimientos conciliados' : 'facturas'}
                        </div>
                        <Pagination 
                            currentPage={page} 
                            totalPages={displayMeta.lastPage} 
                            onPageChange={(p: number) => setPage(p)} 
                        />
                    </div>
                )}

                {displayDTEs.length === 0 && (
                    <div className="text-center py-12">
                        <DocumentTextIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">
                            {statusFilter === 'PAID' ? 'No hay movimientos conciliados en este período' : 'No se encontraron facturas'}
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                            {statusFilter === 'PAID' ? 'Los conciliados aparecen al confirmar matches en Cartolas Bancarias.' : 'Intenta ajustar los filtros de búsqueda'}
                        </p>
                    </div>
                )}
            </div>

            {/* Conciliation Modals Removed - This logic now lives exclusively in /conciliacion */}
        </div>
    );
}
