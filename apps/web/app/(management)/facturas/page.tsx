'use client';

import { useState, useMemo, useCallback } from 'react';
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
import { getApiUrl } from '@/lib/api';

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
    const API_URL = getApiUrl();
    const searchParams = useSearchParams();
    const { mutate: globalMutate } = useSWRConfig();

    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [appliedSearch, setAppliedSearch] = useState(() => searchParams.get('search') || '');
    const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || 'ALL');
    const [syncing, setSyncing] = useState(false);
    const [page, setPage] = useState(1);
    const limit = 15;
    const [selectedMonth, setSelectedMonth] = useState('ALL');
    const [selectedYear, setSelectedYear] = useState('2025');
    const [reviewModal, setReviewModal] = useState<{ dte: DTE; match: DTEMatch } | null>(null);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);

    const { fromDate, toDate, queryStr } = useMemo(() => {
        let from = `${selectedYear}-01-01`;
        let to = `${selectedYear}-12-31`;
        if (selectedMonth !== 'ALL') {
            const lastDay = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
            from = `${selectedYear}-${selectedMonth}-01`;
            to = `${selectedYear}-${selectedMonth}-${lastDay}`;
        }
        const params = new URLSearchParams({
            fromDate: from, toDate: to,
            page: page.toString(), limit: limit.toString(),
            paymentStatus: statusFilter,
            search: appliedSearch || '',
        });
        return { fromDate: from, toDate: to, queryStr: params.toString() };
    }, [page, statusFilter, selectedMonth, selectedYear, appliedSearch]);

    const { data: dtesData, error: dtesError, isLoading: dtesLoading, isValidating: dtesValidating, mutate: mutateDtes } = useSWR(
        statusFilter !== 'PAID' ? `${API_URL}/dtes?${queryStr}` : null,
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

    const matchesResponse = matchesData as { data?: Array<{ matchId: string; transaction: any; dte: any }>; meta?: { total: number; page: number; limit: number; lastPage: number } } | undefined;
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
        matches: [{ id: row.matchId, status: 'CONFIRMED', origin: 'MANUAL', confidence: 1, transaction: row.transaction } as DTEMatch],
    }));
    const matchesMeta = matchesResponse?.meta || null;

    const displayDTEsSource = statusFilter === 'PAID' ? conciliatedRows : dtes;
    const displayMeta = statusFilter === 'PAID' ? matchesMeta : meta;
    const loading = statusFilter === 'PAID' ? (matchesLoading || matchesValidating) : (dtesLoading || dtesValidating);
    const apiError = dtesError || matchesError || summaryError;

    const refreshData = useCallback(() => { mutateDtes(); mutateSummary(); mutateMatches?.(); }, [mutateDtes, mutateSummary, mutateMatches]);

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { setPage(1); setAppliedSearch(search); }
    };

    const handleMatchAction = async (status: 'CONFIRMED' | 'REJECTED') => {
        if (!reviewModal) return;
        setReviewLoading(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}/status`, {
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
            const res = await fetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}`, { method: 'DELETE' });
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

    const downloadPdf = async (id: string, type: number, folio: number) => {
        try {
            const API_URL = getApiUrl();
            const response = await fetch(`${API_URL}/ingestion/libredte/pdf/${id}`);
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
            const lastDay = new Date(parseInt(selectedYear), parseInt(selectedMonth === 'ALL' ? '12' : selectedMonth), 0).getDate();
            const fromDate = selectedMonth === 'ALL' ? `${selectedYear}-01-01` : `${selectedYear}-${selectedMonth}-01`;
            const toDate = selectedMonth === 'ALL' ? `${selectedYear}-12-31` : `${selectedYear}-${selectedMonth}-${lastDay}`;

            await fetch(`${API_URL}/ingestion/libredte/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate,
                    toDate,
                }),
            });
            refreshData();
            alert(`Sincronización para ${selectedMonth === 'ALL' ? selectedYear : MONTHS.find(m => m.value === selectedMonth)?.label} completada`);
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
                        Comprueba que el servidor (API) esté corriendo en <span className="font-mono">http://localhost:3000</span> y vuelve a intentar.
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
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Folio, monto (con o sin puntos), RUT (con o sin DV)... Enter para filtrar"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleSearch}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:w-auto">
                        <div className="flex items-center space-x-2">
                            <select
                                value={selectedYear}
                                onChange={(e) => { setSelectedYear(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium bg-white"
                            >
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <select
                                value={selectedMonth}
                                onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium bg-white"
                            >
                                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-medium bg-white"
                            >
                                <option value="ALL">Estados: Todos</option>
                                <option value="UNPAID">Pendientes</option>
                                <option value="PARTIAL">Parciales</option>
                                <option value="PAID">Pagadas</option>
                            </select>
                        </div>

                        <button
                            onClick={() => { setPage(1); setAppliedSearch(search); }}
                            className="btn-primary py-2 text-xs"
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
                                <th className="px-6 py-4">Folio</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Proveedor</th>
                                <th className="px-6 py-4">Fecha Emisión</th>
                                <th className="px-6 py-4 text-right">Monto Total</th>
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
                                    <td className="px-6 py-4 text-center align-middle">
                                        {(() => {
                                            const match = dte.matches?.[0];
                                            const txDesc = match?.transaction?.description;
                                            const txAmount = match?.transaction?.amount;
                                            const txDate = match?.transaction?.date;
                                            const txBank = match?.transaction?.bankAccount?.bankName;
                                            const canOpen = match && match.transaction;

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
                                                        <div className="text-[11px] text-slate-700 font-semibold leading-tight max-w-[180px] truncate" title={txDesc}>
                                                            {txDesc || 'Transacción'}
                                                        </div>
                                                        {txDate && (
                                                            <div className="text-[10px] text-indigo-500 font-medium">
                                                                {formatDate(txDate)} {txBank && `· ${txBank}`}
                                                            </div>
                                                        )}
                                                        {txAmount != null && (
                                                            <div className="text-[10px] text-slate-400">
                                                                {formatCurrency(Math.abs(txAmount))}
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
                                            return (
                                                <span className="text-slate-400 text-xs">
                                                    Sin match
                                                </span>
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
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                Anterior
                            </button>
                            <div className="flex items-center px-4 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-purple-600">
                                Página {page} de {displayMeta.lastPage}
                            </div>
                            <button
                                onClick={() => setPage(p => Math.min(displayMeta.lastPage, p + 1))}
                                disabled={page === displayMeta.lastPage}
                                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
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
            {reviewModal && reviewModal.match.transaction && (
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
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Movimiento Bancario</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(reviewModal.match.transaction.date)}</p></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-red-700">{formatCurrency(reviewModal.match.transaction.amount)}</p></div>
                                        <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate" title={reviewModal.match.transaction.description}>{reviewModal.match.transaction.description}</p></div>
                                        {reviewModal.match.transaction.bankAccount && (
                                            <div className="col-span-2 text-xs text-slate-500">{reviewModal.match.transaction.bankAccount.bankName} — {reviewModal.match.transaction.bankAccount.accountNumber}</div>
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
                                    <span>Monto: <strong className={Math.abs(reviewModal.dte.totalAmount - Math.abs(reviewModal.match.transaction.amount)) === 0 ? 'text-emerald-600' : 'text-amber-600'}>{formatCurrency(Math.abs(reviewModal.dte.totalAmount - Math.abs(reviewModal.match.transaction.amount)))}</strong></span>
                                    <span>Fecha: <strong className="text-slate-700">{Math.abs(Math.round((new Date(reviewModal.match.transaction.date).getTime() - new Date(reviewModal.dte.issuedDate).getTime()) / 86400000))} días</strong></span>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <input
                                        value={reviewComment}
                                        onChange={e => setReviewComment(e.target.value)}
                                        placeholder="Comentario (opcional)"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>
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
                                </>
                            ) : (
                                <button onClick={handleDiscardMatch} disabled={reviewLoading}
                                    className="flex-1 min-w-[120px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                                    <XCircleIcon className="h-5 w-5" /> Descartar match
                                </button>
                            )}
                            <button onClick={() => setReviewModal(null)} disabled={reviewLoading}
                                className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 disabled:opacity-50">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
