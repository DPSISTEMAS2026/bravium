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
import { UniversalMatchModal } from '@/components/conciliacion/UniversalMatchModal';

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
    const [sortBy, setSortBy] = useState<string>('issuedDate');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
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
                            <label className="text-xs font-bold text-slate-500">Hasta</label>
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

            {/* Modal Revisar / Confirmar Match (mismo flujo que Cartolas) */}
            {(!USE_NEW_MODAL && reviewModal) && (reviewModal.match.transaction || (reviewModal.match as any).payment) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden p-3" onClick={() => setReviewModal(null)} style={{ touchAction: 'none' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className={`shrink-0 px-5 py-3 border-b border-slate-100 flex justify-between items-center ${reviewModal.match.status === 'CONFIRMED' ? 'bg-gradient-to-r from-emerald-50 to-green-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50'}`}>
                            <div>
                                <h2 className="text-base font-bold text-slate-800">
                                    {reviewModal.match.status === 'CONFIRMED' ? 'Match Confirmado' : 'Revisar Sugerencia de Match'}
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Confianza: <span className={`font-bold ${reviewModal.match.confidence >= 0.80 ? 'text-emerald-600' : reviewModal.match.confidence >= 0.60 ? 'text-blue-600' : 'text-amber-600'}`}>{(reviewModal.match.confidence * 100).toFixed(0)}%</span>
                                    {reviewModal.match.ruleApplied && <span className="ml-2 text-slate-400">| {reviewModal.match.ruleApplied}</span>}
                                    {reviewModal.match.origin && <span className="ml-2 text-slate-400">| {reviewModal.match.origin === 'AUTOMATIC' ? 'Automático' : 'Manual'}</span>}
                                </p>
                            </div>
                            <button onClick={() => setReviewModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            {(() => {
                                const tx = reviewModal.match.transaction;
                                const pm = (reviewModal.match as any).payment;
                                const isTx = !!tx;
                                const mDate = tx ? tx.date : pm?.date;
                                const mAmount = tx ? Math.abs(tx.amount) : pm?.amount;
                                const mDesc = tx ? tx.description : (pm?.notes || 'Carga Manual / Registro de Pago');
                                const mBank = tx?.bankAccount?.bankName;

                                return (
                                    <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{isTx ? 'Movimiento Bancario' : 'Carga Manual'}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{mDate ? formatDate(mDate) : '—'}</p></div>
                                                <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-red-700">{formatCurrency(mAmount || 0)}</p></div>
                                                <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate" title={mDesc}>{mDesc}</p></div>
                                                {mBank && (
                                                    <div className="col-span-2 text-xs text-slate-500">{mBank} — {tx?.bankAccount?.accountNumber}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-indigo-200 p-4 bg-indigo-50/30">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><DocumentTextIcon className="h-3.5 w-3.5 text-indigo-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Factura (DTE)</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(reviewModal.dte.issuedDate)}</p></div>
                                                <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-indigo-700">{formatCurrency(reviewModal.dte.totalAmount)}</p></div>
                                                <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Proveedor</span><p className="text-slate-800 truncate" title={reviewModal.dte.provider?.name}>{reviewModal.dte.provider?.name || '—'}</p></div>
                                                <div>Folio <span className="font-bold text-indigo-600">{reviewModal.dte.folio}</span></div>
                                                <div>T{reviewModal.dte.type}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 mt-3">
                                        <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-lg py-1.5 px-3">
                                            <span>Monto: <strong className={Math.abs(reviewModal.dte.totalAmount - (mAmount || 0)) === 0 ? 'text-emerald-600' : 'text-amber-600'}>{formatCurrency(Math.abs(reviewModal.dte.totalAmount - (mAmount || 0)))}</strong></span>
                                            {mDate && <span>Fecha: <strong className="text-slate-700">{Math.abs(Math.round((new Date(mDate).getTime() - new Date(reviewModal.dte.issuedDate).getTime()) / 86400000))} días</strong></span>}
                                        </div>
                                        <div className="flex-1 min-w-[200px]">
                                            <div className="flex flex-wrap gap-1 mb-1.5">
                                                {['Nota de Crédito', 'Pago Parcial', 'Diferencia de Cambio', 'Redondeo'].map(tag => (
                                                    <button 
                                                        key={tag}
                                                        type="button"
                                                        onClick={() => {
                                                            if (!reviewComment.includes(`[${tag}]`)) {
                                                                    setReviewComment(prev => `[${tag}] ${prev}`.trim());
                                                            }
                                                        }}
                                                        className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-md border border-indigo-100 transition-colors"
                                                    >
                                                        + {tag}
                                                    </button>
                                                ))}
                                            </div>
                                            <input
                                                value={reviewComment}
                                                onChange={e => setReviewComment(e.target.value)}
                                                placeholder="Comentario / Motivo de descuadre..."
                                                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3">
                            {reviewModal.match.status !== 'CONFIRMED' ? (
                                <>
                                    <button onClick={() => handleMatchAction('CONFIRMED')} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                                        <CheckCircleIcon className="h-5 w-5" /> Confirmar Match
                                    </button>
                                    <button onClick={() => handleMatchAction('REJECTED')} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                                        <XCircleIcon className="h-5 w-5" /> Rechazar
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (!reviewModal) return;
                                            setManualMatchDte(reviewModal.dte);
                                            // Pre-llenar con el nombre del proveedor para facilitar la búsqueda
                                            setManualMatchSearch(reviewModal.dte.provider?.name || '');
                                            setReviewModal(null); // Cerrar sugerencia
                                        }} 
                                        className="flex-1 min-w-[120px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-200 px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                        <MagnifyingGlassIcon className="h-4 w-4" /> Buscar en Cartola
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={handleUpdateNotes} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                                        <CheckCircleIcon className="h-5 w-5" /> Guardar Notas
                                    </button>
                                    <button onClick={handleDiscardMatch} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                                        <XCircleIcon className="h-5 w-5" /> Descartar match
                                    </button>
                                </>
                            )}
                            <button onClick={() => setReviewModal(null)} disabled={reviewLoading}
                                className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 disabled:opacity-50">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {(!USE_NEW_MODAL && manualMatchDte) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden p-3">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden relative">
                        {/* Header */}
                        <div className="shrink-0 px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                            <div>
                                <h2 className="text-base font-bold text-slate-800">Anotar Movimiento de Factura</h2>
                                <p className="text-xs text-slate-500">Vincula esta factura a un movimiento bancario existente o crea uno nuevo.</p>
                            </div>
                            <button onClick={() => { setManualMatchDte(null); setManualMatchTxResults([]); setManualMatchSelectedTxIds([]); setManualMatchError(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-h-0 overflow-auto flex flex-col p-4">
                            {manualMatchError && (
                                <div className="shrink-0 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    {manualMatchError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                                {/* Panel Izquierdo: Datos de la Factura (DTE) */}
                                <div className="rounded-xl border border-indigo-200 p-4 bg-indigo-50/30 flex flex-col">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                            <DocumentTextIcon className="h-3.5 w-3.5 text-indigo-600" />
                                        </div>
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Factura (DTE)</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase">Fecha Emisión</span>
                                            <p className="font-semibold text-slate-800">{new Date(manualMatchDte.issuedDate).toLocaleDateString('es-CL')}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase">Monto Total</span>
                                            <p className="font-bold text-indigo-700">{formatCurrency(manualMatchDte.totalAmount)}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-[10px] text-slate-400 uppercase">Proveedor</span>
                                            <p className="text-slate-800 font-medium truncate" title={manualMatchDte.provider?.name}>{manualMatchDte.provider?.name || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase">Folio</span>
                                            <p className="font-bold text-indigo-600">{manualMatchDte.folio}</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase">Tipo</span>
                                            <p className="text-slate-800">T{manualMatchDte.type}</p>
                                        </div>
                                    </div>

                                    {/* Comentario / Notas de Conciliación */}
                                    <div className="mt-auto pt-4 border-t border-indigo-100/50">
                                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Comentario / Motivo del gasto (opcional)</label>
                                        <textarea 
                                            value={reviewComment}
                                            onChange={e => setReviewComment(e.target.value)}
                                            placeholder="Ej: Pago de factura para dar por pagada..."
                                            rows={2}
                                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Panel Derecho: Búsqueda de Movimientos / Creación Manual */}
                                <div className="flex flex-col min-h-0">
                                    <p className="text-xs font-semibold text-slate-600 mb-2">Vincular con Movimiento Bancario</p>
                                    <div className="flex gap-2 mb-3">
                                        <input 
                                            type="text" 
                                            value={manualMatchSearch} 
                                            onChange={e => setManualMatchSearch(e.target.value)} 
                                            onKeyDown={e => e.key === 'Enter' && (document.getElementById('btn-manual-search-tx') as any)?.click()}
                                            placeholder="Buscar por descripción o monto..." 
                                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <button 
                                            id="btn-manual-search-tx"
                                            type="button" 
                                            onClick={async () => {
                                                setManualMatchLoading(true);
                                                setManualMatchError(null);
                                                try {
                                                    const res = await authFetch(`${API_URL}/transactions?search=${encodeURIComponent(manualMatchSearch)}&status=PENDING,UNMATCHED,PARTIALLY_MATCHED,MATCHED&limit=30&sortBy=date&order=desc`);
                                                    const data = await res.json().catch(() => ({}));
                                                    setManualMatchTxResults(Array.isArray(data) ? data : data.data || []);
                                                } catch { setManualMatchError('Error al buscar movimientos'); } finally { setManualMatchLoading(false); }
                                            }} 
                                            disabled={manualMatchLoading}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center justify-center"
                                        >
                                            <MagnifyingGlassIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
                                        {manualMatchLoading && (
                                            <div className="flex justify-center py-6"><ArrowPathIcon className="h-5 w-5 animate-spin text-slate-400" /></div>
                                        )}
                                        {manualMatchTxResults.map(tx => (
                                            <div 
                                                key={tx.id} 
                                                onClick={() => {
                                                    setManualMatchSelectedTxIds(prev => 
                                                        prev.includes(tx.id) ? prev.filter(id => id !== tx.id) : [...prev, tx.id]
                                                    );
                                                }}
                                                className={`p-3 border rounded-xl cursor-pointer transition-all flex justify-between items-center ${manualMatchSelectedTxIds.includes(tx.id) ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                            >
                                                <div className="min-w-0 flex-1 flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${manualMatchSelectedTxIds.includes(tx.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                                                        {manualMatchSelectedTxIds.includes(tx.id) && <CheckCircleIcon className="h-4 w-4 text-white" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-slate-800 truncate" title={tx.description}>{tx.description}</p>
                                                        <p className="text-[10px] text-slate-500">{new Date(tx.date).toLocaleDateString('es-CL')}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-red-700">{formatCurrency(tx.amount)}</p>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 rounded px-1 mt-0.5">
                                                            {tx.bankAccount?.bankName || 'Sin Banco'}
                                                        </span>
                                                        {tx.bankAccount?.accountNumber && (
                                                            <span className="text-[8px] text-slate-400">
                                                                N° ...{tx.bankAccount.accountNumber.slice(-4)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {!manualMatchLoading && manualMatchTxResults.length === 0 && (
                                            <div className="text-center py-6">
                                                <p className="text-xs text-slate-400">No se encontraron movimientos pendientes.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Creación Manual de Transacción (Anotar directo) */}
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                // Expande formulario para ingresar row manualmente si no existe!
                                                alert("Si el movimiento no está, puedes ingresarlo como un Registro de Pago Manual en el módulo correspondiente. Muy pronto estará integrado aquí directamente.");
                                            }}
                                            className="w-full text-center text-xs font-semibold text-slate-500 hover:text-indigo-600 py-1"
                                        >
                                            ¿El movimiento no está aquí? Configura un pago directo
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
                            <button 
                                type="button" 
                                onClick={() => { setManualMatchDte(null); setManualMatchTxResults([]); setManualMatchSelectedTxIds([]); setManualMatchError(null); }} 
                                disabled={manualMatchSaving}
                                className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="button" 
                                onClick={async () => {
                                    if (manualMatchSelectedTxIds.length === 0) return;
                                    setManualMatchSaving(true);
                                    setManualMatchError(null);
                                    try {
                                        const res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ 
                                                transactionIds: manualMatchSelectedTxIds, 
                                                dteId: manualMatchDte.id,
                                                notes: reviewComment.trim() || undefined
                                            }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (!res.ok) throw new Error(data?.message || 'Error al conectar');
                                        setManualMatchDte(null);
                                        setManualMatchTxResults([]);
                                        setManualMatchSelectedTxIds([]);
                                        setReviewComment('');
                                        // Refrescar SWR Cache
                                        if (typeof mutateDtes === 'function') mutateDtes();
                                        if (typeof mutateSummary === 'function') mutateSummary();
                                        globalMutate((k: string) => typeof k === 'string' && k.includes('/transactions'));
                                    } catch (e: any) {
                                        setManualMatchError(e?.message || 'Ocurrió un error');
                                    } finally { setManualMatchSaving(false); }
                                }} 
                                disabled={manualMatchSaving || manualMatchSelectedTxIds.length === 0}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                            >
                                {manualMatchSaving ? <ArrowPathIcon className="h-5 w-5 animate-spin"/> : <CheckCircleIcon className="h-5 w-5"/>}
                                Matchear con Factura
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {USE_NEW_MODAL && (
                <UniversalMatchModal
                    isOpen={!!manualMatchDte || !!reviewModal}
                    onClose={() => {
                        setManualMatchDte(null);
                        setReviewModal(null);
                    }}
                    API_URL={API_URL}
                    onRefresh={() => { 
                        refreshData(); 
                        if (typeof globalMutate === 'function') {
                            globalMutate((k: string) => typeof k === 'string' && (k.includes('/dtes') || k.includes('/conciliacion') || k.includes('/transactions'))); 
                        }
                    }}
                    suggestionId={undefined} // We use reviewMatchId for all matches now
                    reviewMatchId={reviewModal ? reviewModal.match.id : undefined}
                    mode={
                        (reviewModal && reviewModal.match.status === 'DRAFT') ? 'SUGGESTION' :
                        (reviewModal && reviewModal.match.status === 'CONFIRMED') ? 'REVIEW' : 'MANUAL'
                    }
                    initialDtes={
                        manualMatchDte ? [manualMatchDte] :
                        reviewModal ? [reviewModal.dte] : []
                    }
                    initialTransactions={
                        reviewModal && reviewModal.match.transaction ? [reviewModal.match.transaction] : undefined
                    }
                />
            )}
        </div>
    );
}
