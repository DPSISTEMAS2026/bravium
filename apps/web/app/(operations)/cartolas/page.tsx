
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import {
    MagnifyingGlassIcon,
    BanknotesIcon,
    ArrowPathIcon,
    CloudArrowUpIcon,
    AdjustmentsHorizontalIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    DocumentChartBarIcon,
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    SparklesIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    HandThumbUpIcon,
    HandThumbDownIcon,
    PlusCircleIcon,
    LinkIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    XMarkIcon,
    TrashIcon,
    PencilSquareIcon,
    EyeIcon,
    ArrowsRightLeftIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, authFetch } from '../../../lib/api';
import { Pagination } from '@/components/ui/Pagination';
import { useCartolaIngestion } from '../../../contexts/CartolaIngestionContext';
import { useAuth } from '../../../contexts/AuthContext';
import { CartolasManualMatchSection } from './CartolasConciliacionSections';
import { ManualMatchForm } from './ManualMatchForm';
import { UniversalMatchModal } from '../../../components/conciliacion/UniversalMatchModal';

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

// Solo Nov y Dic 2025 + todo 2026
const MONTHS_2025 = [
    { value: 'ALL', label: 'Nov - Dic 2025' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' },
];

const YEARS = ['2026', '2025'];

interface CartolaSourceFile {
    filename: string;
    bankAccountId: string;
    bankName: string;
    accountNumber: string;
    count: number;
}

// Meses de 2026 disponibles: solo hasta el mes actual (en abril se activa abril, etc.)
function getMonths2026() {
    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    if (year < 2026) return MONTHS; // Aún no es 2026: mostrar todos
    const upTo = year === 2026 ? currentMonth : 12;
    return [
        { value: 'ALL', label: upTo < 12 ? `Ene - ${MONTHS[upTo].label} 2026` : 'Todo el año' },
        ...MONTHS.slice(1, upTo + 1),
    ];
}

interface MatchDte {
    id: string;
    folio: number;
    type: number;
    totalAmount: number;
    outstandingAmount: number;
    issuedDate: string;
    dueDate?: string;
    rutIssuer: string;
    paymentStatus: string;
    provider?: { id: string; name: string; rut: string };
}

interface MatchEntry {
    id: string;
    status: string;
    origin: string;
    confidence: number;
    ruleApplied?: string;
    notes?: string;
    dte?: MatchDte;
    payment?: {
        amount: number;
        provider?: { name: string };
    };
}

interface PendingSuggestionSummary {
    id: string;
    type: string;
    confidence: number;
    providerName?: string;
    folio?: number;
    dteType?: number;
    totalAmount?: number;
}

interface Transaction {
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
    matches: MatchEntry[];
    pendingSuggestion?: PendingSuggestionSummary;
    origin: string;
    metadata?: any;
}

interface Summary {
    total: number;
    totalDebits: number;
    totalCredits: number;
    netFlow: number;
    byStatus: {
        PENDING: number;
        MATCHED: number;
        PARTIALLY_MATCHED: number;
        UNMATCHED: number;
    };
    matched: number;
    unmatched: number;
    matchRate: number;
}

interface BankAccount {
    id: string;
    bankName: string;
    accountNumber: string;
}

export default function CartolasPage() {
    const API_URL = getApiUrl();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const [page, setPage] = useState(1);
    const limit = 15;
    const USE_NEW_MODAL = true; // Universal modal siempre activo

    // Filters
    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [appliedSearch, setAppliedSearch] = useState(() => searchParams.get('search') || '');
    const [fromDate, setFromDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [selectedAccount, setSelectedAccount] = useState(() => searchParams.get('bankAccountId') || 'ALL');
    const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type') || 'ALL');
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'ALL');
    const [selectedFilename, setSelectedFilename] = useState('ALL');

    // UI States
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadForceReplace, setUploadForceReplace] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ status: string; message?: string; insertedRows?: number } | null>(null);
    const [uploadBankAccountId, setUploadBankAccountId] = useState<string>('');
    const [dragOver, setDragOver] = useState(false);
    const ingestion = useCartolaIngestion();
    // Motor de conciliación: ejecutar manual, paneles Sugerencias / Match manual
    const [runMatchLoading, setRunMatchLoading] = useState(false);
    const [showManualMatch, setShowManualMatch] = useState(false);
    const [isCartolasVisible, setIsCartolasVisible] = useState(false); // Minimizar cartolas cargadas

    // Match review modal
    const [reviewTx, setReviewTx] = useState<Transaction | null>(null);
    const [reviewMatch, setReviewMatch] = useState<MatchEntry | null>(null);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);
    // Alternativas en el mismo modal: carga bajo demanda
    const [showAlternatives, setShowAlternatives] = useState(false);
    const [altByAmountFrom, setAltByAmountFrom] = useState('');
    const [altByAmountTo, setAltByAmountTo] = useState('');
    const [altAmountMin, setAltAmountMin] = useState('');
    const [altAmountMax, setAltAmountMax] = useState('');
    const [altDtesResults, setAltDtesResults] = useState<any[]>([]);
    const [altDtesLoading, setAltDtesLoading] = useState(false);
    const [providerSearch, setProviderSearch] = useState('');
    const [providerSearchDebounced, setProviderSearchDebounced] = useState('');
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [providerResultsLoading, setProviderResultsLoading] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<any>(null);
    const [providerDtes, setProviderDtes] = useState<any[]>([]);
    const [providerDtesLoading, setProviderDtesLoading] = useState(false);
    const [providerFolioFilter, setProviderFolioFilter] = useState('');
    const [replacingMatch, setReplacingMatch] = useState(false);
    const [reviewReplaceError, setReviewReplaceError] = useState<string | null>(null);
    const [pendingReplaceDte, setPendingReplaceDte] = useState<{ dte: any; isReassign?: boolean } | null>(null);

    // Modal de sugerencia pendiente (Sum/Split desde la tabla)
    const [suggestionModalId, setSuggestionModalId] = useState<string | null>(null);
    const [suggestionDetail, setSuggestionDetail] = useState<any>(null);
    const [suggestionDetailLoading, setSuggestionDetailLoading] = useState(false);
    const [suggestionActionLoading, setSuggestionActionLoading] = useState(false);
    // Editar sugerencia SUM: quitar movimientos y/o elegir otro DTE del mismo proveedor
    const [suggestionRemovedTxIds, setSuggestionRemovedTxIds] = useState<string[]>([]);
    const [suggestionAddedTxIds, setSuggestionAddedTxIds] = useState<string[]>([]);
    const [suggestionRemovedDteIds, setSuggestionRemovedDteIds] = useState<string[]>([]);
    const [suggestionAddedDteIds, setSuggestionAddedDteIds] = useState<string[]>([]);
    const [suggestionOverrideDteId, setSuggestionOverrideDteId] = useState<string | null>(null);
    const [suggestionProviderUnpaidDtes, setSuggestionProviderUnpaidDtes] = useState<any[]>([]);
    const [suggestionProviderUnpaidDtesLoading, setSuggestionProviderUnpaidDtesLoading] = useState(false);
    // Movimientos a este RUT (para SUM): otros movimientos PENDING/UNMATCHED a mismo proveedor, para añadir a la sugerencia
    const [suggestionOtherMovementsRut, setSuggestionOtherMovementsRut] = useState<any[]>([]);
    const [suggestionOtherMovementsRutLoading, setSuggestionOtherMovementsRutLoading] = useState(false);

    // Annotation modal (mark pending as reviewed) + matchear con factura dentro del modal
    const [annotateTx, setAnnotateTx] = useState<Transaction | null>(null);
    const [annotateNote, setAnnotateNote] = useState('');
    const [annotateLoading, setAnnotateLoading] = useState(false);
    const [annotateDteSearch, setAnnotateDteSearch] = useState('');
    const [annotateDteResults, setAnnotateDteResults] = useState<any[]>([]);
    const [annotateDteSelected, setAnnotateDteSelected] = useState<any>(null);
    const [annotateDteSelectedIds, setAnnotateDteSelectedIds] = useState<string[]>([]);
    const [annotateDteLoading, setAnnotateDteLoading] = useState(false);
    const [annotateMatchLoading, setAnnotateMatchLoading] = useState(false);
    const [annotateMatchError, setAnnotateMatchError] = useState<string | null>(null);

    // Sorting state
    const [sortBy, setSortBy] = useState<'date' | 'amount' | 'description' | 'type'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Asociar proveedor en la anotación
    const [annotateProviderSearch, setAnnotateProviderSearch] = useState('');
    const [annotateProviderResults, setAnnotateProviderResults] = useState<any[]>([]);
    const [annotateProviderSelected, setAnnotateProviderSelected] = useState<any>(null);

    const handleSort = (field: 'date' | 'amount' | 'description' | 'type') => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
        setPage(1);
    };

    // Eliminar cartola: confirmación y loading
    const [deleteCartolaFilename, setDeleteCartolaFilename] = useState<string | null>(null);
    const [deletingCartola, setDeletingCartola] = useState(false);

    // Modal corregir tipo de movimiento (Cargo ↔ Abono)
    const [correctTypeTx, setCorrectTypeTx] = useState<Transaction | null>(null);
    const [correctAmountTx, setCorrectAmountTx] = useState<Transaction | null>(null);
    const [correctAmountValue, setCorrectAmountValue] = useState<string>('');
    const [correctAmountSaving, setCorrectAmountSaving] = useState(false);
    const [correctAmountError, setCorrectAmountError] = useState<string | null>(null);
    const [correctTypeSaving, setCorrectTypeSaving] = useState(false);
    const [correctTypeError, setCorrectTypeError] = useState<string | null>(null);

    // Aceptar rápido (sin abrir modal): match id o suggestion id en curso
    const [quickAcceptingId, setQuickAcceptingId] = useState<string | null>(null);



    // Rango del periodo seleccionado (para requests y cartolas visibles)
    const periodDates = useMemo(() => {
        return { fromDate, toDate };
    }, [fromDate, toDate]);

    // Build query params for SWR keys (cartolas: solo Nov-Dic 2025 y 2026 hasta mes actual)
    const queryParams = useMemo(() => {
        const { fromDate, toDate } = periodDates;
        const params = new URLSearchParams({
            fromDate, toDate,
            page: page.toString(),
            limit: limit.toString(),
            search: appliedSearch || '',
        });
        if (selectedAccount !== 'ALL') params.append('bankAccountId', selectedAccount);
        if (typeFilter !== 'ALL') params.append('type', typeFilter);
        if (statusFilter !== 'ALL') params.append('status', statusFilter);
        if (selectedFilename !== 'ALL') params.append('filename', selectedFilename);
        if (sortBy) params.append('sortBy', sortBy);
        if (sortOrder) params.append('order', sortOrder);
        return params.toString();
    }, [page, periodDates, selectedAccount, typeFilter, statusFilter, selectedFilename, appliedSearch, sortBy, sortOrder]);

    // SWR: Static data (cached globally, rarely changes)
    const { data: bankAccounts = [] } = useSWR<BankAccount[]>(
        user?.organizationId ? `${API_URL}/transactions/bank-accounts?org=${user.organizationId}` : null
    );

    // Cartolas visibles solo en el periodo seleccionado (no todas las ingestadas)
    const { data: cartolasInPeriod = [] } = useSWR<{ filename: string }[]>(
        user?.organizationId ? `${API_URL}/transactions/files-in-period?fromDate=${periodDates.fromDate}&toDate=${periodDates.toDate}&org=${user.organizationId}` : null,
    );

    // Todas las cartolas cargadas (para listar y poder eliminar)
    const { data: allCartolas = [], mutate: mutateAllCartolas } = useSWR<CartolaSourceFile[]>(
        user?.organizationId ? `${API_URL}/transactions/source-files-all?org=${user.organizationId}` : null,
    );

    // SWR: keepPreviousData para que al confirmar/rechazar un match no parpadee ni recargue toda la vista
    const { data: txData, isLoading: txLoading, isValidating: txValidating, mutate: mutateTx } = useSWR(
        user?.organizationId ? `${API_URL}/transactions?${queryParams}&org=${user.organizationId}` : null,
        { keepPreviousData: true }
    );
    const { data: summary, mutate: mutateSummary } = useSWR<Summary>(
        user?.organizationId ? `${API_URL}/transactions/summary?${queryParams}&org=${user.organizationId}` : null,
        { keepPreviousData: true }
    );

    const { data: historicalNotes = {} } = useSWR<Record<string, string>>(
        `${API_URL}/conciliacion/matches/historical-notes`
    );

    const transactions: Transaction[] = txData?.data || txData || [];
    const meta = txData?.meta || null;
    // Solo mostrar skeleton en carga inicial; al revalidar (tras confirmar match, etc.) seguimos mostrando datos
    const loading = txLoading;

    const refreshData = useCallback(() => {
        mutateTx();
        mutateSummary();
    }, [mutateTx, mutateSummary]);

    /** Invalida caché de Facturas y Proveedores para que reflejen matches confirmados aquí */
    const invalidateDtesAndProveedores = useCallback(() => {
        globalMutate((k: string) => typeof k === 'string' && (k.includes('/dtes') || k.includes('/proveedores')));
    }, []);

    const openReviewModal = (tx: Transaction, match: MatchEntry) => {
        setReviewTx(tx);
        setReviewMatch(match);
        setReviewComment('');
    };

    const closeReviewModal = () => {
        setReviewTx(null);
        setReviewMatch(null);
        setReviewComment('');
        setReviewReplaceError(null);
        setShowAlternatives(false);
        setAltDtesResults([]);
        setProviderSearch('');
        setProviderSearchDebounced('');
        setProviderResults([]);
        setSelectedProvider(null);
        setProviderDtes([]);
        setPendingReplaceDte(null);
    };

    /** Helper: aplica una actualización optimista a la lista de transacciones sin quitar ninguna fila */
    const optimisticUpdate = useCallback(
        (updater: (txList: Transaction[]) => Transaction[]) => {
            mutateTx((current: any) => {
                if (!current) return current;
                const list: Transaction[] = current?.data ?? current ?? [];
                const updated = updater(list);
                return current?.data ? { ...current, data: updated } : updated;
            }, { revalidate: false });
            // Revalidar en background después de un breve delay para traer datos frescos sin flash
            setTimeout(() => { mutateTx(); mutateSummary(); }, 600);
        },
        [mutateTx, mutateSummary],
    );

    const handleMatchAction = async (action: 'CONFIRMED' | 'REJECTED') => {
        if (!reviewMatch || !reviewTx) return;
        setReviewLoading(true);
        const matchId = reviewMatch.id;
        const txId = reviewTx.id;
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${matchId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: action, reason: reviewComment || undefined }),
            });
            if (!res.ok) throw new Error('Error al actualizar');
            
            // Si rechaza y dejó un comentario, guardar la nota en la transacción para que persista como Anotación
            if (action === 'REJECTED' && reviewComment.trim()) {
                await quickAnnotateNote(txId, reviewComment.trim());
            }

            closeReviewModal();
            // Optimistic: actualizar el status del match y de la transacción en la lista actual
            optimisticUpdate((list) =>
                list.map((tx) => {
                    if (tx.id !== txId) return tx;
                    // Si se rechaza, la transacción pasará a UNMATCHED si fue anotada, o PENDING si no.
                    const isAnnotated = action === 'REJECTED' && reviewComment.trim();
                    const updatedMatches = tx.matches.map((m) =>
                        m.id === matchId ? { ...m, status: action } : m,
                    );
                    return {
                        ...tx,
                        status: action === 'CONFIRMED' ? 'MATCHED' : (isAnnotated ? 'UNMATCHED' : tx.status),
                        matches: updatedMatches,
                        metadata: isAnnotated ? { ...tx.metadata, reviewNote: reviewComment.trim(), reviewedAt: new Date().toISOString() } : tx.metadata
                    };
                }),
            );
            invalidateDtesAndProveedores();
        } catch (err) {
            console.error('Error updating match:', err);
        } finally {
            setReviewLoading(false);
        }
    };

    const quickAcceptMatch = async (matchId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setQuickAcceptingId(matchId);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${matchId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CONFIRMED' }),
            });
            if (!res.ok) throw new Error('Error al confirmar');
            // Optimistic: actualizar in-place
            optimisticUpdate((list) =>
                list.map((tx) => {
                    const hasMatch = tx.matches.some((m) => m.id === matchId);
                    if (!hasMatch) return tx;
                    return {
                        ...tx,
                        status: 'MATCHED',
                        matches: tx.matches.map((m) =>
                            m.id === matchId ? { ...m, status: 'CONFIRMED' } : m,
                        ),
                    };
                }),
            );
            invalidateDtesAndProveedores();
        } catch (err) {
            console.error('Quick accept match:', err);
        } finally {
            setQuickAcceptingId(null);
        }
    };

    const quickAcceptSuggestion = async (suggestionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setQuickAcceptingId(suggestionId);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/suggestions/${suggestionId}/accept`, { method: 'POST' });
            if (!res.ok) throw new Error('Error al aceptar sugerencia');
            // Optimistic: marcar como MATCHED las tx de esta sugerencia
            optimisticUpdate((list) =>
                list.map((tx) => {
                    if (tx.pendingSuggestion?.id !== suggestionId) return tx;
                    return { ...tx, status: 'MATCHED', pendingSuggestion: undefined };
                }),
            );
            invalidateDtesAndProveedores();
        } catch (err) {
            console.error('Quick accept suggestion:', err);
        } finally {
            setQuickAcceptingId(null);
        }
    };

    const handleDiscardMatch = async () => {
        if (!reviewMatch || !reviewTx) return;
        const matchId = reviewMatch.id;
        const txId = reviewTx.id;
        setReviewLoading(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${matchId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al descartar');
            closeReviewModal();
            // Optimistic: quitar el match de la tx y volver a PENDING
            optimisticUpdate((list) =>
                list.map((tx) => {
                    if (tx.id !== txId) return tx;
                    const remaining = tx.matches.filter((m) => m.id !== matchId);
                    return {
                        ...tx,
                        status: remaining.length > 0 ? tx.status : 'PENDING',
                        matches: remaining,
                        hasMatch: remaining.length > 0,
                        matchCount: remaining.length,
                    };
                }),
            );
            invalidateDtesAndProveedores();
        } catch (err) {
            console.error('Error discarding match:', err);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleReplaceWithDte = async (dte: { id: string }) => {
        if (!reviewTx) return;
        setReviewReplaceError(null);
        setReplacingMatch(true);
        setPendingReplaceDte(null);
        try {
            if (reviewMatch?.id) {
                await authFetch(`${API_URL}/conciliacion/matches/${reviewMatch.id}`, { method: 'DELETE' });
            }
            const res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: reviewTx.id, dteId: dte.id }),
            });
            const data = await res.json().catch(() => ({}) as any);
            if (!res.ok) throw new Error(data?.message || 'Error al asignar');
            const txId = reviewTx.id;
            closeReviewModal();
            // Optimistic: marcar como MATCHED
            optimisticUpdate((list) =>
                list.map((tx) => (tx.id !== txId ? tx : { ...tx, status: 'MATCHED' })),
            );
            invalidateDtesAndProveedores();
        } catch (err: any) {
            setReviewReplaceError(err?.message || 'No se pudo asignar el DTE');
        } finally {
            setReplacingMatch(false);
        }
    };

    const handleReassignDte = async (dte: { id: string }) => {
        if (!reviewTx) return;
        setReviewReplaceError(null);
        setReplacingMatch(true);
        setPendingReplaceDte(null);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/reassign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId: reviewTx.id,
                    dteId: dte.id,
                    currentMatchId: reviewMatch?.id || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}) as any);
            if (!res.ok) throw new Error(data?.message || 'Error al reasignar');
            const txId = reviewTx.id;
            const releasedTxId = data.releasedTransactionId;
            closeReviewModal();
            // Optimistic: mark current tx as MATCHED and released tx as PENDING
            optimisticUpdate((list) =>
                list.map((tx) => {
                    if (tx.id === txId) return { ...tx, status: 'MATCHED' };
                    if (tx.id === releasedTxId) return { ...tx, status: 'PENDING', matches: [] };
                    return tx;
                }),
            );
            invalidateDtesAndProveedores();
        } catch (err: any) {
            setReviewReplaceError(err?.message || 'No se pudo reasignar el DTE');
        } finally {
            setReplacingMatch(false);
        }
    };

    const searchAltDtesByDateAmount = useCallback(async () => {
        if (!reviewTx) return;
        const absAmount = Math.abs(reviewTx.amount);
        const from = altByAmountFrom || (() => { const d = new Date(reviewTx.date); d.setDate(d.getDate() - 45); return d.toISOString().split('T')[0]; })();
        const to = altByAmountTo || (() => { const d = new Date(reviewTx.date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
        const min = altAmountMin ? Number(altAmountMin) : Math.round(absAmount * 0.9);
        const max = altAmountMax ? Number(altAmountMax) : Math.round(absAmount * 1.1);
        setAltDtesLoading(true);
        try {
            const params = new URLSearchParams({
                fromDate: from,
                toDate: to,
                paymentStatus: 'UNPAID',
                minAmount: String(min),
                maxAmount: String(max),
                limit: '30',
                includeMatched: 'true',
            });
            const res = await authFetch(`${API_URL}/dtes?${params}`);
            if (res.ok) {
                const data = await res.json();
                setAltDtesResults(Array.isArray(data) ? data : data.data || []);
            }
        } catch { setAltDtesResults([]); }
        finally { setAltDtesLoading(false); }
    }, [API_URL, reviewTx, altByAmountFrom, altByAmountTo, altAmountMin, altAmountMax]);

    useEffect(() => {
        if (!providerSearch.trim()) {
            setProviderSearchDebounced('');
            return;
        }
        const t = setTimeout(() => setProviderSearchDebounced(providerSearch.trim()), 300);
        return () => clearTimeout(t);
    }, [providerSearch]);

    useEffect(() => {
        if (!showAlternatives || !providerSearchDebounced || providerSearchDebounced.length < 2) {
            setProviderResults([]);
            return;
        }
        let cancelled = false;
        setProviderResultsLoading(true);
        authFetch(`${API_URL}/proveedores?search=${encodeURIComponent(providerSearchDebounced)}`)
            .then(res => res.ok ? res.json() : [])
            .then(data => { if (!cancelled) setProviderResults(Array.isArray(data) ? data : (data?.data ?? data?.providers ?? [])); })
            .catch(() => { if (!cancelled) setProviderResults([]); })
            .finally(() => { if (!cancelled) setProviderResultsLoading(false); });
        return () => { cancelled = true; };
    }, [API_URL, showAlternatives, providerSearchDebounced]);

    useEffect(() => {
        if (!annotateProviderSearch.trim() || annotateProviderSearch.trim().length < 2) {
            setAnnotateProviderResults([]);
            return;
        }
        const t = setTimeout(() => {
            authFetch(`${API_URL}/proveedores?search=${encodeURIComponent(annotateProviderSearch)}`)
                .then(res => res.json())
                .then(j => setAnnotateProviderResults(j.data || j || []))
                .catch(() => setAnnotateProviderResults([]));
        }, 300);
        return () => clearTimeout(t);
    }, [API_URL, annotateProviderSearch]);

    useEffect(() => {
        if (!selectedProvider?.id) {
            setProviderDtes([]);
            return;
        }
        let cancelled = false;
        setProviderDtesLoading(true);
        authFetch(`${API_URL}/dtes?providerId=${selectedProvider.id}&paymentStatus=UNPAID&includeMatched=true&limit=50`)
            .then(res => res.ok ? res.json() : [])
            .then(data => { const list = Array.isArray(data) ? data : data.data || []; if (!cancelled) setProviderDtes(list); })
            .catch(() => { if (!cancelled) setProviderDtes([]); })
            .finally(() => { if (!cancelled) setProviderDtesLoading(false); });
        return () => { cancelled = true; };
    }, [API_URL, selectedProvider?.id]);

    // Bloquear scroll del fondo cuando cualquier modal de cartola está abierto
    useEffect(() => {
        if (annotateTx || (reviewTx && reviewMatch) || suggestionModalId) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [annotateTx, reviewTx, reviewMatch, suggestionModalId]);

    // Cargar detalle de sugerencia cuando se abre el modal
    useEffect(() => {
        if (!suggestionModalId) {
            setSuggestionDetail(null);
            setSuggestionRemovedTxIds([]);
            setSuggestionAddedTxIds([]);
            setSuggestionRemovedDteIds([]);
            setSuggestionAddedDteIds([]);
            setSuggestionOverrideDteId(null);
            setSuggestionProviderUnpaidDtes([]);
            setSuggestionOtherMovementsRut([]);
            return;
        }
        let cancelled = false;
        setSuggestionDetailLoading(true);
        authFetch(`${API_URL}/conciliacion/suggestions/${suggestionModalId}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (!cancelled) {
                    setSuggestionDetail(data);
                    setSuggestionRemovedTxIds([]);
                    setSuggestionOverrideDteId(null);
                    setSuggestionAddedTxIds([]);
                }
            })
            .catch(() => { if (!cancelled) setSuggestionDetail(null); })
            .finally(() => { if (!cancelled) setSuggestionDetailLoading(false); });
        return () => { cancelled = true; };
    }, [API_URL, suggestionModalId]);

    // Cargar DTEs sin pagar del proveedor cuando la sugerencia SUM tiene proveedor
    useEffect(() => {
        const providerId = suggestionDetail?.dte?.provider?.id ?? suggestionDetail?.dte?.providerId;
        if (!suggestionModalId || !suggestionDetail || !providerId) {
            setSuggestionProviderUnpaidDtes([]);
            return;
        }
        let cancelled = false;
        setSuggestionProviderUnpaidDtesLoading(true);
        authFetch(`${API_URL}/dtes?providerId=${encodeURIComponent(providerId)}&paymentStatus=UNPAID&limit=50`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data : data?.data ?? [];
                setSuggestionProviderUnpaidDtes(list);
            })
            .catch(() => { if (!cancelled) setSuggestionProviderUnpaidDtes([]); })
            .finally(() => { if (!cancelled) setSuggestionProviderUnpaidDtesLoading(false); });
        return () => { cancelled = true; };
    }, [API_URL, suggestionModalId, suggestionDetail?.type, suggestionDetail?.dte?.provider?.id, suggestionDetail?.dte?.providerId]);

    // Cargar otros movimientos bancarios hechos a este RUT (PENDING/UNMATCHED) para poder añadirlos a la sugerencia SUM
    useEffect(() => {
        const providerRut = suggestionDetail?.dte?.provider?.rut;
        const suggestionTxIds = new Set((suggestionDetail?.transactions || []).map((t: any) => t.id));
        if (!suggestionModalId || !suggestionDetail || !providerRut) {
            setSuggestionOtherMovementsRut([]);
            return;
        }
        let cancelled = false;
        setSuggestionOtherMovementsRutLoading(true);
        const statusParam = 'PENDING,UNMATCHED';
        authFetch(`${API_URL}/transactions?search=${encodeURIComponent(providerRut)}&status=${statusParam}&limit=50`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data : data?.data ?? [];
                const other = list.filter((tx: any) => !suggestionTxIds.has(tx.id));
                setSuggestionOtherMovementsRut(other);
            })
            .catch(() => { if (!cancelled) setSuggestionOtherMovementsRut([]); })
            .finally(() => { if (!cancelled) setSuggestionOtherMovementsRutLoading(false); });
        return () => { cancelled = true; };
    }, [API_URL, suggestionModalId, suggestionDetail?.type, suggestionDetail?.dte?.provider?.rut, suggestionDetail?.transactions]);

    const handleAcceptSuggestion = async () => {
        if (!suggestionModalId || !suggestionDetail) return;
        const curSuggestionId = suggestionModalId;

        // Transacciones efectivas
        const transactions = (suggestionDetail.transactions || []) as any[];
        const baseTxIds = transactions
            .filter((tx: any) => !suggestionRemovedTxIds.includes(tx.id))
            .map((tx: any) => tx.id);
        const effectiveTxIds = [...baseTxIds, ...suggestionAddedTxIds];
        if (effectiveTxIds.length === 0) return;

        // DTEs efectivos
        const suggestionDtes = suggestionDetail.type === 'SPLIT' 
            ? (suggestionDetail.relatedDtes || []) 
            : (suggestionDetail.dte ? [suggestionDetail.dte] : []);
            
        const baseDteIds = suggestionDtes
            .filter((dte: any) => !suggestionRemovedDteIds.includes(dte.id))
            .map((dte: any) => dte.id);
            
        const effectiveDteIds = [...baseDteIds, ...suggestionAddedDteIds];
        
        // Mantener compatibilidad con override individual heredado if any
        if (suggestionOverrideDteId && !effectiveDteIds.includes(suggestionOverrideDteId)) {
            effectiveDteIds.push(suggestionOverrideDteId);
        }

        if (effectiveDteIds.length === 0) return;

        const hasOverrides = suggestionRemovedTxIds.length > 0 || 
                             suggestionAddedTxIds.length > 0 || 
                             suggestionRemovedDteIds.length > 0 || 
                             suggestionAddedDteIds.length > 0 || 
                             suggestionOverrideDteId != null;

        setSuggestionActionLoading(true);
        try {
            const opts: RequestInit = { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    transactionIds: effectiveTxIds, 
                    dteIds: effectiveDteIds 
                })
            };
            const res = await authFetch(`${API_URL}/conciliacion/suggestions/${curSuggestionId}/accept`, opts);
            if (res.ok) {
                setSuggestionModalId(null);
                // Optimistic: marcar tx afectadas como MATCHED
                const txIdSet = new Set(effectiveTxIds);
                optimisticUpdate((list) =>
                    list.map((tx) => {
                        if (txIdSet.has(tx.id) || tx.pendingSuggestion?.id === curSuggestionId) {
                            return { ...tx, status: 'MATCHED', pendingSuggestion: undefined };
                        }
                        return tx;
                    }),
                );
                invalidateDtesAndProveedores();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err?.message || 'Error al aceptar la sugerencia');
            }
        } finally {
            setSuggestionActionLoading(false);
        }
    };

    const handleRejectSuggestion = async () => {
        if (!suggestionModalId) return;
        const curSuggestionId = suggestionModalId;
        setSuggestionActionLoading(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/suggestions/${curSuggestionId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Rechazada por usuario' }),
            });
            if (res.ok) {
                setSuggestionModalId(null);
                // Optimistic: quitar la sugerencia de las tx afectadas, dejar status sin cambiar
                optimisticUpdate((list) =>
                    list.map((tx) => {
                        if (tx.pendingSuggestion?.id !== curSuggestionId) return tx;
                        return { ...tx, pendingSuggestion: undefined };
                    }),
                );
            }
        } finally {
            setSuggestionActionLoading(false);
        }
    };

    const openAnnotateModal = (tx: Transaction) => {
        setAnnotateTx(tx);
        setAnnotateNote(tx.metadata?.reviewNote || '');
    };

    const closeAnnotateModal = () => {
        setAnnotateTx(null);
        setAnnotateNote('');
        setAnnotateDteSearch('');
        setAnnotateDteResults([]);
        setAnnotateDteSelected(null);
        setAnnotateDteSelectedIds([]);
        setAnnotateMatchError(null);
    };

    /** Cierra el modal de cartola que esté abierto (anotar, match o sugerencia) — mismo modal unificado */
    const closeCartolaModal = () => {
        if (suggestionModalId) setSuggestionModalId(null);
        else if (reviewTx && reviewMatch) closeReviewModal();
        else if (annotateTx) closeAnnotateModal();
    };

    const searchAnnotateDtes = async () => {
        if (!annotateDteSearch.trim()) return;
        setAnnotateDteLoading(true);
        setAnnotateMatchError(null);
        try {
            const params = new URLSearchParams({ search: annotateDteSearch.trim(), paymentStatus: 'UNPAID', includeMatched: 'true', limit: '15' });
            const res = await authFetch(`${API_URL}/dtes?${params}`);
            const data = await res.json().catch(() => ({}));
            setAnnotateDteResults(Array.isArray(data) ? data : data.data || []);
            setAnnotateDteSelected(null);
        } catch {
            setAnnotateDteResults([]);
        } finally {
            setAnnotateDteLoading(false);
        }
    };

    const handleAnnotateMatch = async () => {
        if (!annotateTx || annotateDteSelectedIds.length === 0) return;
        const txId = annotateTx.id;
        setAnnotateMatchLoading(true);
        setAnnotateMatchError(null);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId: txId,
                    dteIds: annotateDteSelectedIds,
                    notes: annotateNote.trim() || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || 'Error al crear match');
            closeAnnotateModal();
            // Optimistic: marcar como MATCHED
            optimisticUpdate((list) =>
                list.map((tx) => (tx.id !== txId ? tx : { ...tx, status: 'MATCHED' })),
            );
            invalidateDtesAndProveedores();
        } catch (err: any) {
            setAnnotateMatchError(err?.message || 'No se pudo crear el match');
        } finally {
            setAnnotateMatchLoading(false);
        }
    };

    const handleAnnotateSave = async () => {
        if (!annotateTx) return;
        const txId = annotateTx.id;
        const note = annotateNote.trim();
        setAnnotateLoading(true);
        try {
            const res = await authFetch(`${API_URL}/transactions/${txId}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    note: note || '', 
                    providerId: annotateProviderSelected?.id 
                }),
            });
            if (!res.ok) throw new Error('Error al guardar');
            closeAnnotateModal();
            // Optimistic: marcar como UNMATCHED (revisado)
            optimisticUpdate((list) =>
                list.map((tx) => (tx.id !== txId ? tx : {
                    ...tx,
                    status: 'UNMATCHED',
                    metadata: { 
                        ...(tx.metadata as any || {}), 
                        reviewNote: note, 
                        reviewedAt: new Date().toISOString(),
                        providerId: annotateProviderSelected?.id,
                        providerName: annotateProviderSelected?.name
                    },
                })),
            );
        } catch (err) {
            console.error('Error saving annotation:', err);
        } finally {
            setAnnotateLoading(false);
        }
    };

    const quickAnnotateNote = async (txId: string, note: string) => {
        try {
            const res = await authFetch(`${API_URL}/transactions/${txId}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note })
            });
            if (!res.ok) throw new Error('Error al guardar');
            // Optimistic: marcar como UNMATCHED (revisado)
            optimisticUpdate((list) =>
                list.map((tx) => (tx.id !== txId ? tx : {
                    ...tx,
                    status: 'UNMATCHED',
                    metadata: { ...tx.metadata, reviewNote: note, reviewedAt: new Date().toISOString() },
                })),
            );
        } catch (err) {
            console.error('Error quick annotating:', err);
        }
    };

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setPage(1);
            setAppliedSearch(search);
        }
    };

    const runConciliacion = async () => {
        setRunMatchLoading(true);
        try {
            await authFetch(`${API_URL}/conciliacion/run-auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    syncFromSources: false,
                    organizationId: user?.organizationId,
                }),
            });
            refreshData();
            globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
            invalidateDtesAndProveedores();
        } finally {
            setRunMatchLoading(false);
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Cartolas Bancarias</h1>
                    <p className="text-slate-600 mt-1">
                        Movimientos extraídos de cartolas bancarias
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="btn-primary flex items-center space-x-2 shadow-lg shadow-purple-600/20"
                    >
                        <CloudArrowUpIcon className="h-5 w-5" />
                        <span>Cargar Cartola</span>
                    </button>
                </div>
            </div>

            {/* Cartolas cargadas: listar y eliminar */}
            {allCartolas.length > 0 && (
                <div className="card p-4 border-slate-200 bg-white">
                    <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => setIsCartolasVisible(!isCartolasVisible)}>
                        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5 text-slate-500" />
                            Cartolas cargadas
                        </h2>
                        <button
                            type="button"
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                        >
                            {isCartolasVisible ? (
                                <ChevronUpIcon className="h-5 w-5 font-bold" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5 font-bold" />
                            )}
                        </button>
                    </div>
                    {isCartolasVisible && (
                        <>
                            <p className="text-sm text-slate-600 mt-2 mb-4">
                                Puedes eliminar los movimientos de una cartola para volver a cargarla desde cero (ej. si la carga falló y reportó 0 movimientos).
                            </p>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-600 text-left">
                                    <th className="py-2 pr-4 font-medium">Archivo</th>
                                    <th className="py-2 pr-4 font-medium">Banco / Cuenta</th>
                                    <th className="py-2 pr-4 font-medium text-right">Movimientos</th>
                                    <th className="py-2 w-24"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {allCartolas.map((row) => (
                                    <tr key={`${row.filename}-${row.bankAccountId}`} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2.5 pr-4 font-medium text-slate-800">{row.filename}</td>
                                        <td className="py-2.5 pr-4 text-slate-600">{row.bankName} — {row.accountNumber}</td>
                                        <td className="py-2.5 pr-4 text-right">{row.count.toLocaleString('es-CL')}</td>
                                        <td className="py-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setDeleteCartolaFilename(row.filename)}
                                                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-medium"
                                                title="Eliminar movimientos de esta cartola para poder volver a cargarla"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                                Eliminar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </>
                    )}
                </div>
            )}

            {/* Modal confirmar eliminar cartola */}
            {deleteCartolaFilename && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !deletingCartola && setDeleteCartolaFilename(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Eliminar cartola</h3>
                        <p className="text-slate-600 mb-4">
                            Se eliminarán todos los movimientos del archivo <strong>{deleteCartolaFilename}</strong>. Los matches y sugerencias asociados también se eliminarán. Podrás volver a cargar este archivo desde cero.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => setDeleteCartolaFilename(null)}
                                disabled={deletingCartola}
                                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!deleteCartolaFilename) return;
                                    setDeletingCartola(true);
                                    try {
                                        const res = await authFetch(`${API_URL}/transactions/delete-cartola`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ sourceFile: deleteCartolaFilename }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (!res.ok) throw new Error(data?.message || 'Error al eliminar');
                                        setDeleteCartolaFilename(null);
                                        mutateAllCartolas();
                                        refreshData();
                                        globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
                                    } catch (e: any) {
                                        alert(e?.message || 'Error al eliminar la cartola');
                                    } finally {
                                        setDeletingCartola(false);
                                    }
                                }}
                                disabled={deletingCartola}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {deletingCartola ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                                {deletingCartola ? 'Eliminando...' : 'Eliminar movimientos'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="card-glass p-5 flex items-center space-x-4">
                        <div className="bg-purple-100 p-3 rounded-xl text-purple-600">
                            <DocumentChartBarIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-slate-900">{summary.total}</div>
                            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Movimientos</div>
                        </div>
                    </div>

                    <div className="card-glass p-5 flex items-center space-x-4">
                        <div className="bg-green-100 p-3 rounded-xl text-green-600">
                            <ArrowTrendingUpIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-700">{formatCurrency(summary.totalCredits)}</div>
                            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Abonos (+)</div>
                        </div>
                    </div>

                    <div className="card-glass p-5 flex items-center space-x-4">
                        <div className="bg-red-100 p-3 rounded-xl text-red-600">
                            <ArrowTrendingDownIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-red-700">{formatCurrency(Math.abs(summary.totalDebits))}</div>
                            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Cargos (-)</div>
                        </div>
                    </div>

                    <div className="card-glass p-5 flex items-center space-x-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
                            <CheckCircleIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-blue-700">{summary.matchRate.toFixed(1)}%</div>
                            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Tasa Conciliación</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Motor de conciliación: ejecutar, sugerencias, match manual */}
            <div className="card p-4 border-indigo-100 bg-indigo-50/30">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-800">Motor de conciliación</h2>
                    </div>
                    <button
                        onClick={runConciliacion}
                        disabled={runMatchLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {runMatchLoading ? (
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        ) : (
                            <SparklesIcon className="h-5 w-5" />
                        )}
                        <span>{runMatchLoading ? 'Ejecutando...' : 'Ejecutar conciliación'}</span>
                    </button>
                </div>
                <p className="text-sm text-slate-600 mb-4">Los matches se comparten con Conciliación (KPIs), Facturas (DTEs conciliados) y Proveedores (estado de cuenta). Usa el filtro <strong>&quot;Sugerencias&quot;</strong> en la tabla para ver y gestionar todas las sugerencias del motor. Para ver movimientos de todas las cuentas (incl. tarjeta de cr&#233;dito), usa <strong>&quot;Todas las cuentas&quot;</strong> y <strong>&quot;Todas las cartolas del periodo&quot;</strong>.</p>

                <div className="space-y-3">
                    <button
                        onClick={() => setShowManualMatch(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl shadow-md font-bold hover:bg-indigo-700 transition-colors"
                    >
                        <SparklesIcon className="h-5 w-5" />
                        Hacer Match Multidocumento (Universal)
                    </button>
                    <UniversalMatchModal
                        isOpen={showManualMatch || (USE_NEW_MODAL && !!suggestionModalId && !!suggestionDetail) || (USE_NEW_MODAL && !!reviewMatch) || (USE_NEW_MODAL && !!annotateTx)}
                        onClose={() => {
                            setShowManualMatch(false);
                            if (USE_NEW_MODAL) {
                                setSuggestionModalId(null);
                                setSuggestionDetail(null);
                                closeReviewModal();
                                setAnnotateTx(null);
                            }
                        }}
                        API_URL={API_URL}
                        onRefresh={() => { refreshData(); invalidateDtesAndProveedores(); }}
                        suggestionId={(USE_NEW_MODAL && suggestionModalId) ? suggestionModalId : undefined}
                        reviewMatchId={(USE_NEW_MODAL && reviewMatch?.id) ? reviewMatch.id : undefined}
                        matchStatus={(USE_NEW_MODAL && reviewMatch?.status) ? reviewMatch.status : undefined}
                        mode={
                            (USE_NEW_MODAL && annotateTx) ? 'ANNOTATE' :
                            (USE_NEW_MODAL && suggestionModalId) ? 'SUGGESTION' :
                            (USE_NEW_MODAL && reviewMatch) ? 'REVIEW' : 'MANUAL'
                        }
                        onAnnotateSave={
                            (USE_NEW_MODAL && annotateTx) ? async (note, providerId, ruleId) => {
                                if (!annotateTx?.id || annotateTx.id === '-') {
                                    console.error('ID de transacción inválido para anotación:', annotateTx);
                                    return;
                                }
                                const res = await authFetch(`${API_URL}/transactions/${annotateTx.id}/review`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ note, providerId, ruleId })
                                });
                                if (!res.ok) throw new Error('Error al guardar la nota');
                                
                                optimisticUpdate((list) =>
                                    list.map((tx) => (tx.id !== annotateTx.id ? tx : {
                                        ...tx,
                                        status: ruleId ? 'MATCHED' : 'UNMATCHED',
                                        metadata: { 
                                            ...(tx.metadata as any || {}), 
                                            reviewNote: note, 
                                            providerId: providerId,
                                            reviewedAt: new Date().toISOString()
                                        },
                                    })),
                                );
                            } : undefined
                        }
                        initialTransactions={
                            USE_NEW_MODAL && suggestionDetail 
                                ? (suggestionDetail.transactions || [suggestionDetail.transaction].filter(Boolean)) 
                                : (USE_NEW_MODAL && reviewTx ? [reviewTx] : 
                                   USE_NEW_MODAL && annotateTx ? [annotateTx] : undefined)
                        }
                        initialDtes={
                            USE_NEW_MODAL && suggestionDetail 
                                ? (suggestionDetail.type === 'SPLIT' ? (suggestionDetail.relatedDtes || []) : (suggestionDetail.dte ? [suggestionDetail.dte] : [])) 
                                : (USE_NEW_MODAL && reviewMatch && reviewMatch.dte ? [reviewMatch.dte] : undefined)
                        }
                    />
                    
                    {USE_NEW_MODAL && suggestionModalId && suggestionDetailLoading && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                            <ArrowPathIcon className="h-10 w-10 text-white animate-spin" />
                        </div>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-col lg:flex-row gap-3 items-center">
                    {/* Buscador Prominente */}
                    <div className="relative flex-grow lg:flex-[3]">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Descripción, referencia, monto (con o sin puntos)... Enter para filtrar"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleSearch}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all bg-white shadow-sm"
                        />
                    </div>

                    {/* Filtros Compactos */}
                    <div className="flex flex-wrap lg:flex-nowrap gap-2 items-center w-full lg:w-auto">
                        <select
                            value={selectedAccount}
                            onChange={(e) => { setSelectedAccount(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium bg-white shadow-sm min-w-[140px]"
                        >
                            <option value="ALL">Todas las cuentas</option>
                            {bankAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                            ))}
                        </select>

                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium bg-white shadow-sm w-[115px]"
                        />

                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                            className="px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium bg-white shadow-sm w-[115px]"
                        />

                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium bg-white shadow-sm w-[140px]"
                        >
                            <option value="ALL">Todos</option>
                            <option value="MATCHED">Conciliados</option>
                            <option value="PARTIALLY_MATCHED">Sugerencias</option>
                            <option value="PENDING">Pendientes (Cargos)</option>
                            <option value="CREDIT_ABONOS">⬇ Abonos Bancarios</option>
                            <option value="UNMATCHED">Revisados</option>
                        </select>

                        <div className="flex items-center gap-1.5" title="Elegir qué cartola visualizar">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:inline">Cartola</span>
                        <select
                            value={cartolasInPeriod.some(f => f.filename === selectedFilename) ? selectedFilename : 'ALL'}
                            onChange={(e) => { setSelectedFilename(e.target.value); setPage(1); }}
                            className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-medium bg-white shadow-sm max-w-[220px]"
                        >
                            <option value="ALL">Todas las cartolas del periodo</option>
                            {cartolasInPeriod.map(f => (
                                <option key={f.filename} value={f.filename}>
                                    {f.filename === '__NO_SOURCE_FILE__' ? 'Otros movimientos (sin archivo)' : f.filename}
                                </option>
                            ))}
                        </select>
                        </div>

                        <button
                            onClick={() => { setPage(1); setAppliedSearch(search); }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition-colors flex items-center justify-center min-w-[40px]"
                            title="Filtrar"
                        >
                            <MagnifyingGlassIcon className="h-5 w-5" />
                        </button>
                    </div>
                    {selectedAccount !== 'ALL' && (
                        <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                            Mostrando solo esta cuenta. Para ver tambi&#233;n tarjeta de cr&#233;dito u otras, elige <strong>Todas las cuentas</strong>.
                        </p>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                {txValidating && transactions.length > 0 && (
                    <div className="px-6 py-1.5 bg-indigo-50/80 border-b border-indigo-100 text-xs text-indigo-600 flex items-center gap-2">
                        <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                        Actualizando…
                    </div>
                )}
                {statusFilter === 'PARTIALLY_MATCHED' && (
                    <div className="px-6 py-3 bg-blue-50/80 border-b border-blue-100 text-sm text-slate-700 space-y-1">
                        <p>
                            Total: <strong>{meta?.total ?? transactions.length}</strong> sugerencias con los filtros actuales (período, cuenta, cartola).
                            Para ver todas las del sistema, elige &quot;Todo el año&quot; y &quot;Todas las cuentas&quot;.
                        </p>
                        <p className="text-xs text-slate-600">
                            Si no ves sugerencias de la tarjeta de cr&#233;dito u otra cartola, ejecuta <strong>Ejecutar conciliaci&#243;n</strong> de nuevo: el motor procesa todas las cuentas del periodo.
                        </p>
                    </div>
                )}
                {((meta && meta.lastPage > 1) || (statusFilter === 'PARTIALLY_MATCHED' && meta?.total != null)) ? (
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            Mostrando <span className="font-semibold text-slate-700">{transactions.length}</span> de <span className="font-semibold text-slate-700">{meta!.total}</span>
                            {statusFilter === 'PARTIALLY_MATCHED' ? ' sugerencias' : ' movimientos'}
                        </div>
                        <Pagination 
                            currentPage={page} 
                            totalPages={meta!.lastPage} 
                            onPageChange={(p: number) => setPage(p)} 
                        />
                    </div>
                ) : null}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100 uppercase tracking-tight text-[11px]">
                            <tr>
                                <th className="px-6 py-4 cursor-pointer select-none group" onClick={() => handleSort('date')}>
                                    <div className="flex items-center gap-1">
                                        Fecha {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="opacity-0 group-hover:opacity-50">↕</span>}
                                    </div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer select-none group" onClick={() => handleSort('description')}>
                                    <div className="flex items-center gap-1">
                                        Descripción {sortBy === 'description' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="opacity-0 group-hover:opacity-50">↕</span>}
                                    </div>
                                </th>
                                <th className="px-6 py-4 cursor-pointer select-none text-right group" onClick={() => handleSort('amount')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Monto {sortBy === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="opacity-0 group-hover:opacity-50">↕</span>}
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-center">Tipo</th>
                                <th className="px-6 py-4 text-center">Cartola</th>
                                <th className="px-6 py-4 text-center">Conciliación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-4 bg-slate-50/50 h-16"></td>
                                    </tr>
                                ))
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                        No se encontraron movimientos para el periodo seleccionado
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => {
                                    const firstMatch = tx.matches?.[0];
                                    const matchedName = firstMatch?.dte?.provider?.name
                                        || firstMatch?.payment?.provider?.name
                                        || null;
                                    const matchedFolio = firstMatch?.dte?.folio;
                                    const matchedType = firstMatch?.dte?.type;
                                    const matchedAmount = firstMatch?.dte?.totalAmount ?? firstMatch?.payment?.amount;
                                    const cartolaName = tx.metadata?.sourceFile
                                        ? tx.metadata.sourceFile.replace(/\.[^.]+$/, '')
                                        : null;

                                    return (
                                        <tr key={tx.id} className="hover:bg-purple-50/30 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">
                                                {formatDate(tx.date)}
                                            </td>
                                            <td className="px-6 py-4 max-w-xs xl:max-w-md">
                                                <div className="truncate text-slate-700 font-medium" title={tx.description}>
                                                    {tx.description}
                                                    {tx.metadata && (tx.metadata as any).providerName && (
                                                        <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full mt-1 w-max border border-slate-200">
                                                            {(tx.metadata as any).providerName}
                                                        </span>
                                                    )}
                                                </div>
                                                {tx.reference && (
                                                    <div className="text-[10px] text-slate-400 mt-0.5">Ref: {tx.reference}</div>
                                                )}
                                            </td>
                                            <td className={`px-6 py-4 text-right font-bold text-base whitespace-nowrap ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-slate-900 underline decoration-red-200 decoration-2 underline-offset-4'}`}>
                                                <div className="flex items-center justify-end gap-1 group">
                                                    <span>{formatCurrency(tx.amount)}</span>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => { setCorrectAmountTx(tx); setCorrectAmountValue(String(Math.abs(tx.amount))); }} 
                                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 p-0.5 transition-opacity"
                                                        title="Corregir monto"
                                                    >
                                                        <PencilSquareIcon className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${tx.type === 'CREDIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {tx.type === 'CREDIT' ? 'ABONO' : 'CARGO'}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setCorrectTypeTx(tx)}
                                                        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                        title="Corregir tipo (Cargo/Abono)"
                                                    >
                                                        <PencilSquareIcon className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    {cartolaName ? (
                                                        <span className="text-xs text-slate-700 font-medium max-w-[160px] truncate block" title={tx.metadata?.sourceFile}>
                                                            {cartolaName}
                                                        </span>
                                                    ) : tx.origin === 'API_INTEGRATION' ? (
                                                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1" title="Sincronización automática">
                                                            <CloudArrowUpIcon className="h-3 w-3"/> Fintoc
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 italic">—</span>
                                                    )}
                                                    <span className="text-[10px] mt-1 font-bold uppercase text-slate-500">
                                                        {tx.bankAccount?.bankName || 'Banco'}{tx.bankAccount?.accountNumber ? ' · ' + (tx.bankAccount.accountNumber.length > 4 ? tx.bankAccount.accountNumber.slice(-4) : tx.bankAccount.accountNumber) : ''}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center align-middle">
                                                {tx.status === 'MATCHED' && firstMatch ? (
                                                    <button
                                                        onClick={() => openReviewModal(tx, firstMatch)}
                                                        className="mx-auto flex flex-col items-center text-center cursor-pointer group hover:scale-105 transition-transform"
                                                    >
                                                        <span className="inline-flex items-center text-emerald-600 font-bold text-xs mb-1 group-hover:bg-emerald-50 rounded px-2 py-0.5 transition-colors">
                                                            <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                            OK
                                                        </span>
                                                        <div className="text-[11px] text-slate-700 font-semibold leading-tight">
                                                            {matchedName || 'Match encontrado'}
                                                        </div>
                                                        {matchedFolio && (
                                                            <div className="text-[10px] text-indigo-500 font-medium">
                                                                Folio {matchedFolio} {matchedType ? `(T${matchedType})` : ''}
                                                            </div>
                                                        )}
                                                        {matchedAmount != null && (
                                                            <div className="text-[10px] text-slate-400">
                                                                {formatCurrency(matchedAmount)}
                                                            </div>
                                                        )}
                                                    </button>
                                                ) : tx.status === 'PARTIALLY_MATCHED' && firstMatch ? (
                                                    <div className="mx-auto flex flex-col items-center text-center">
                                                        <button
                                                            onClick={() => openReviewModal(tx, firstMatch)}
                                                            className="flex flex-col items-center cursor-pointer group hover:scale-105 transition-transform"
                                                        >
                                                            <span className="inline-flex items-center text-blue-600 font-bold text-xs mb-1 ring-1 ring-blue-200 rounded px-2 py-0.5 group-hover:bg-blue-50 group-hover:ring-blue-400 transition-colors">
                                                                <ClockIcon className="h-3.5 w-3.5 mr-1" />
                                                                SUGERENCIA
                                                            </span>
                                                            <div className="text-[11px] text-slate-700 font-semibold leading-tight">
                                                                {matchedName || 'Posible match'}
                                                            </div>
                                                            {matchedFolio && (
                                                                <div className="text-[10px] text-indigo-500 font-medium">
                                                                    Folio {matchedFolio} {matchedType ? `(T${matchedType})` : ''}
                                                                </div>
                                                            )}
                                                            <div className="text-[10px] text-blue-500 font-medium">
                                                                Score: {(firstMatch.confidence * 100).toFixed(0)}%
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => quickAcceptMatch(firstMatch.id, e)}
                                                            disabled={quickAcceptingId === firstMatch.id}
                                                            className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-60"
                                                        >
                                                            {quickAcceptingId === firstMatch.id ? (
                                                                <ArrowPathIcon className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <CheckCircleIcon className="h-3 w-3" />
                                                            )}
                                                            Aceptar
                                                        </button>
                                                    </div>
                                                ) : tx.status === 'MATCHED' && tx.metadata?.autoCategorized ? (
                                                    <button 
                                                        onClick={() => openAnnotateModal(tx)}
                                                        className="mx-auto flex flex-col items-center text-center cursor-pointer group hover:scale-105 transition-transform" 
                                                        title="Regla de Gasto Fijo aplicada automáticamente. Clic para detalles."
                                                    >
                                                        <span className="inline-flex items-center text-purple-600 font-bold text-xs mb-1 bg-purple-50 rounded px-2 py-0.5 border border-purple-200 group-hover:bg-purple-100 transition-colors">
                                                            <SparklesIcon className="h-3.5 w-3.5 mr-1" />
                                                            GASTO FIJO
                                                        </span>
                                                        <div className="text-[10px] text-purple-700 font-medium leading-tight max-w-[140px] truncate">
                                                            {tx.metadata.reviewNote?.replace('[Auto: ', '')?.replace(']', '') || 'Regla Automática'}
                                                        </div>
                                                    </button>
                                                ) : tx.status === 'MATCHED' ? (
                                                    <span className="inline-flex items-center text-emerald-600 font-bold text-xs">
                                                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                        OK
                                                    </span>
                                                ) : tx.status === 'UNMATCHED' && tx.metadata?.reviewNote ? (
                                                    <button
                                                        onClick={() => openAnnotateModal(tx)}
                                                        className="mx-auto flex flex-col items-center text-center cursor-pointer group hover:scale-105 transition-transform"
                                                    >
                                                        <span className="inline-flex items-center text-slate-500 font-bold text-xs mb-1 ring-1 ring-slate-300 rounded px-2 py-0.5 group-hover:bg-slate-100 transition-colors">
                                                            <CheckCircleIcon className="h-3.5 w-3.5 mr-1 text-slate-400" />
                                                            REVISADO
                                                        </span>
                                                        <div className="text-[10px] text-slate-500 leading-tight max-w-[140px] truncate" title={tx.metadata.reviewNote}>
                                                            {tx.metadata.reviewNote}
                                                        </div>
                                                    </button>
                                                ) : tx.status === 'PENDING' && tx.pendingSuggestion ? (
                                                    <div className="mx-auto flex flex-col items-center text-center">
                                                        <button
                                                            onClick={() => setSuggestionModalId(tx.pendingSuggestion!.id)}
                                                            className="flex flex-col items-center cursor-pointer group hover:scale-105 transition-transform"
                                                        >
                                                            <span className="inline-flex items-center text-blue-600 font-bold text-xs mb-1 ring-1 ring-blue-200 rounded px-2 py-0.5 group-hover:bg-blue-50 group-hover:ring-blue-400 transition-colors">
                                                                <ClockIcon className="h-3.5 w-3.5 mr-1" />
                                                                SUGERENCIA
                                                            </span>
                                                            <div className="text-[11px] text-slate-700 font-semibold leading-tight">
                                                                {tx.pendingSuggestion.providerName || 'Posible match'}
                                                            </div>
                                                            {tx.pendingSuggestion.folio != null && (
                                                                <div className="text-[10px] text-indigo-500 font-medium">
                                                                    Folio {tx.pendingSuggestion.folio}{tx.pendingSuggestion.dteType != null ? ` (T${tx.pendingSuggestion.dteType})` : ''}
                                                                </div>
                                                            )}
                                                            <div className="text-[10px] text-blue-500 font-medium">
                                                                Score: {(tx.pendingSuggestion.confidence * 100).toFixed(0)}%
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => quickAcceptSuggestion(tx.pendingSuggestion!.id, e)}
                                                            disabled={quickAcceptingId === tx.pendingSuggestion!.id}
                                                            className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-60"
                                                        >
                                                            {quickAcceptingId === tx.pendingSuggestion!.id ? (
                                                                <ArrowPathIcon className="h-3 w-3 animate-spin" />
                                                            ) : (
                                                                <CheckCircleIcon className="h-3 w-3" />
                                                            )}
                                                            Aceptar
                                                        </button>
                                                    </div>
                                                ) : tx.status === 'PENDING' ? (
                                                    <div className="flex flex-col items-center gap-1 mx-auto text-center">
                                                        <button
                                                            onClick={() => openAnnotateModal(tx)}
                                                            className="flex flex-col items-center cursor-pointer group hover:scale-105 transition-transform"
                                                        >
                                                            <span className="inline-flex items-center text-amber-500 font-bold text-xs ring-1 ring-amber-200 ring-offset-2 rounded px-2 py-0.5 group-hover:bg-amber-50 group-hover:ring-amber-400 transition-colors">
                                                                <ClockIcon className="h-3 w-3 mr-1" />
                                                                PENDIENTE
                                                            </span>
                                                        </button>
                                                        {(() => { const noteKey = `${tx.description}|${tx.amount}`; const note = historicalNotes[noteKey]; return note ? (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); quickAnnotateNote(tx.id, note); }}
                                                                className="px-2 py-0.5 mt-1 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg text-[9px] font-semibold hover:bg-amber-100/80 transition-all flex items-center shadow-sm max-w-[140px] truncate"
                                                                title={`Sugerencia: ${note}`}
                                                            >
                                                                💡 {note}
                                                            </button>
                                                        ) : null; })()}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openAnnotateModal(tx)}
                                                        className="mx-auto flex justify-center cursor-pointer group hover:scale-105 transition-transform"
                                                    >
                                                        <span className="text-red-400 text-xs font-bold group-hover:bg-red-50 rounded px-2 py-0.5 transition-colors">REVISAR</span>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {((meta && meta.lastPage > 1) || (statusFilter === 'PARTIALLY_MATCHED' && meta?.total != null)) ? (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            Mostrando <span className="font-semibold text-slate-700">{transactions.length}</span> de <span className="font-semibold text-slate-700">{meta!.total}</span>
                            {statusFilter === 'PARTIALLY_MATCHED' ? ' sugerencias' : ' movimientos'}
                        </div>
                        <Pagination 
                            currentPage={page} 
                            totalPages={meta!.lastPage} 
                            onPageChange={(p: number) => setPage(p)} 
                        />
                    </div>
                ) : null}
            </div>

            {/* Modal único Cartola: mismo diseño; contenido y acciones según el caso (Anotar | Match | Sugerencia) */}
            {(!USE_NEW_MODAL && (annotateTx || (reviewTx && reviewMatch) || suggestionModalId)) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden p-3" onClick={closeCartolaModal} style={{ touchAction: 'none' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        {/* Header único: título y subtítulo según caso */}
                        <div className={`shrink-0 px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r ${
                            suggestionModalId ? 'from-blue-50 to-indigo-50' : (reviewTx && reviewMatch) ? (reviewMatch.status === 'CONFIRMED' ? 'from-emerald-50 to-green-50' : 'from-blue-50 to-indigo-50') : 'from-amber-50 to-orange-50'
                        }`}>
                            <div>
                                <h2 className="text-base font-bold text-slate-800">
                                    {suggestionModalId ? 'Revisar Sugerencia de Match' : (reviewTx && reviewMatch) ? (reviewMatch.status === 'CONFIRMED' ? 'Match Confirmado' : 'Revisar Sugerencia de Match') : 'Anotar Movimiento'}
                                </h2>
                                <p className="text-xs text-slate-500">
                                    {suggestionModalId && suggestionDetail && (
                                        <>Confianza: <span className={`font-bold ${(suggestionDetail.confidence || 0) >= 0.80 ? 'text-emerald-600' : (suggestionDetail.confidence || 0) >= 0.60 ? 'text-blue-600' : 'text-amber-600'}`}>{((suggestionDetail.confidence || 0) * 100).toFixed(0)}%</span>
                                        {suggestionDetail.ruleApplied && <span className="ml-2 text-slate-400">| {suggestionDetail.ruleApplied}</span>}
                                        {suggestionDetail.type && <span className="ml-2 text-slate-400">| {suggestionDetail.type === 'SUM' ? 'Suma (varios movimientos → 1 factura)' : 'Split (1 movimiento → varias facturas)'}</span>}</>
                                    )}
                                    {(reviewTx && reviewMatch) && !suggestionModalId && (
                                        <>Confianza: <span className={`font-bold ${reviewMatch.confidence >= 0.80 ? 'text-emerald-600' : reviewMatch.confidence >= 0.60 ? 'text-blue-600' : 'text-amber-600'}`}>{(reviewMatch.confidence * 100).toFixed(0)}%</span>
                                        {reviewMatch.ruleApplied && <span className="ml-2 text-slate-400">| {reviewMatch.ruleApplied}</span>}
                                        {reviewMatch.origin && <span className="ml-2 text-slate-400">| {reviewMatch.origin === 'AUTOMATIC' ? 'Automático' : 'Manual'}</span>}</>
                                    )}
                                    {annotateTx && !(reviewTx && reviewMatch) && !suggestionModalId && 'Describe el concepto para marcar como revisado'}
                                </p>
                            </div>
                            <button onClick={closeCartolaModal} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Body: contenido según caso (Match | Sugerencia | Anotar) */}
                        <div className="flex-1 min-h-0 overflow-auto flex flex-col p-4">
                            {reviewTx && reviewMatch && (
                        <>
                            {reviewReplaceError && (
                                <div className="shrink-0 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                    {reviewReplaceError}
                                </div>
                            )}
                            {/* Fila 1: Movimiento | DTE + diferencias + comentario en una línea */}
                            <div className="grid grid-cols-2 gap-4 shrink-0">
                                <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Movimiento Bancario</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(reviewTx.date)}</p></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-red-700">{formatCurrency(reviewTx.amount)}</p></div>
                                        <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate" title={reviewTx.description}>{reviewTx.description}</p></div>
                                        <div className="col-span-2 text-xs text-slate-500">{reviewTx.bankAccount?.bankName} — {reviewTx.bankAccount?.accountNumber}</div>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-indigo-200 p-4 bg-indigo-50/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><DocumentChartBarIcon className="h-3.5 w-3.5 text-indigo-600" /></div>
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Factura(s) (DTE)</h3>
                                        {reviewTx.matches && reviewTx.matches.length > 1 && (
                                            <span className="text-[10px] text-slate-500 ml-1">— {reviewTx.matches.length} DTEs (split)</span>
                                        )}
                                    </div>
                                    {reviewTx.matches && reviewTx.matches.length > 1 ? (
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {reviewTx.matches.map((m, i) => m.dte && (
                                                <div key={m.id || i} className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm border-b border-indigo-100 pb-2 last:border-0 last:pb-0">
                                                    <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(m.dte.issuedDate)}</p></div>
                                                    <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-indigo-700">{formatCurrency(m.dte.totalAmount)}</p></div>
                                                    <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Proveedor</span><p className="text-slate-800 truncate" title={m.dte.provider?.name}>{m.dte.provider?.name || '—'}</p></div>
                                                    <div>Folio <span className="font-bold text-indigo-600">{m.dte.folio}</span> T{m.dte.type}</div>
                                                </div>
                                            ))}
                                            <p className="text-xs text-slate-500 mt-1">Suma: {formatCurrency(reviewTx.matches.reduce((s, m) => s + (m.dte?.totalAmount ?? 0), 0))}</p>
                                        </div>
                                    ) : reviewMatch.dte ? (
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                            <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(reviewMatch.dte.issuedDate)}</p></div>
                                            <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-indigo-700">{formatCurrency(reviewMatch.dte.totalAmount)}</p></div>
                                            <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Proveedor</span><p className="text-slate-800 truncate" title={reviewMatch.dte.provider?.name}>{reviewMatch.dte.provider?.name || '—'}</p></div>
                                            <div>Folio <span className="font-bold text-indigo-600">{reviewMatch.dte.folio}</span></div>
                                            <div>T{reviewMatch.dte.type}</div>
                                        </div>
                                    ) : <p className="text-sm text-slate-500 italic">Sin DTE</p>}
                                </div>
                            </div>

                            {/* Fila 2: Diferencias + comentario en una línea */}
                            <div className="shrink-0 flex flex-wrap items-center gap-4 mt-3">
                                {(reviewMatch.dte || (reviewTx.matches && reviewTx.matches.length > 1)) && (() => {
                                    const totalDte = reviewTx.matches && reviewTx.matches.length > 1
                                        ? reviewTx.matches.reduce((s, m) => s + (m.dte?.totalAmount ?? 0), 0)
                                        : (reviewMatch.dte?.totalAmount ?? 0);
                                    const diff = Math.abs(totalDte - Math.abs(reviewTx.amount));
                                    const days = reviewMatch.dte
                                        ? Math.abs(Math.round((new Date(reviewTx.date).getTime() - new Date(reviewMatch.dte.issuedDate).getTime()) / 86400000))
                                        : null;
                                    return (
                                        <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-lg py-1.5 px-3">
                                            <span>Monto: <strong className={diff === 0 ? 'text-emerald-600' : 'text-amber-600'}>{formatCurrency(diff)}</strong> {reviewTx.matches && reviewTx.matches.length > 1 && '(suma DTEs vs movimiento)'}</span>
                                            {days != null && <span>Fecha: <strong className="text-slate-700">{days} días</strong></span>}
                                        </div>
                                    );
                                })()}
                                <div className="flex-1 min-w-[200px]">
                                    <input
                                        value={reviewComment}
                                        onChange={e => setReviewComment(e.target.value)}
                                        placeholder="Comentario (opcional)"
                                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Toggle: No es este movimiento */}
                            <div className="shrink-0 mt-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAlternatives(!showAlternatives);
                                        if (!showAlternatives && reviewTx) {
                                            const d = new Date(reviewTx.date);
                                            const from = new Date(d); from.setDate(from.getDate() - 45);
                                            const to = new Date(d); to.setDate(to.getDate() + 30);
                                            const abs = Math.abs(reviewTx.amount);
                                            setAltByAmountFrom(from.toISOString().split('T')[0]);
                                            setAltByAmountTo(to.toISOString().split('T')[0]);
                                            setAltAmountMin(String(Math.round(abs * 0.9)));
                                            setAltAmountMax(String(Math.round(abs * 1.1)));
                                        }
                                    }}
                                    className="w-full flex items-center justify-between px-4 py-2 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-800 text-sm font-medium hover:bg-amber-100"
                                >
                                    <span>No es este movimiento — buscar otra opción</span>
                                    {showAlternatives ? <ChevronUpIcon className="h-5 w-5 shrink-0" /> : <ChevronDownIcon className="h-5 w-5 shrink-0" />}
                                </button>
                            </div>

                            {/* Buscar por fecha/monto | Buscar por proveedor: 2 columnas */}
                            {showAlternatives && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3 shrink-0">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Por fecha y monto</h4>
                                        <div className="grid grid-cols-4 gap-1.5 mb-2">
                                            <div><label className="text-[10px] text-slate-500 block">Desde</label><input type="date" value={altByAmountFrom} onChange={e => setAltByAmountFrom(e.target.value)} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs" /></div>
                                            <div><label className="text-[10px] text-slate-500 block">Hasta</label><input type="date" value={altByAmountTo} onChange={e => setAltByAmountTo(e.target.value)} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs" /></div>
                                            <div><label className="text-[10px] text-slate-500 block">Mín</label><input type="number" value={altAmountMin} onChange={e => setAltAmountMin(e.target.value)} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs" /></div>
                                            <div><label className="text-[10px] text-slate-500 block">Máx</label><input type="number" value={altAmountMax} onChange={e => setAltAmountMax(e.target.value)} className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs" /></div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={searchAltDtesByDateAmount} disabled={altDtesLoading} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                                                {altDtesLoading ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <MagnifyingGlassIcon className="h-3.5 w-3.5" />} Buscar
                                            </button>
                                            {altDtesResults.length > 0 && <span className="text-[10px] text-slate-500">{altDtesResults.length} factura(s)</span>}
                                        </div>
                                        {altDtesResults.length > 0 && (
                                            <div className="mt-2 max-h-32 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-white">
                                                {altDtesResults.map((dte: any) => {
                                                    const isMatched = dte.hasMatch || (dte.matches && dte.matches.length > 0 && dte.matches.some((m: any) => m.status === 'CONFIRMED'));
                                                    const confirmedMatch = isMatched ? dte.matches?.find((m: any) => m.status === 'CONFIRMED') : null;
                                                    return (
                                                        <div key={dte.id} className={`w-full px-2 py-1.5 flex items-center gap-2 text-xs ${isMatched ? 'bg-amber-50/50' : 'hover:bg-indigo-50'}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPendingReplaceDte({ dte, isReassign: isMatched })}
                                                                disabled={replacingMatch}
                                                                className="flex-1 min-w-0 text-left flex items-center gap-1.5 disabled:opacity-50"
                                                            >
                                                                <span className="truncate">Folio {dte.folio} — {dte.provider?.name || '—'}</span>
                                                                {isMatched && (
                                                                    <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold">Ya asignado</span>
                                                                )}
                                                            </button>
                                                            <span className="text-indigo-600 font-semibold shrink-0">{formatCurrency(dte.totalAmount)}</span>
                                                            {isMatched && confirmedMatch?.transaction && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); window.open(`/cartolas?search=${encodeURIComponent(confirmedMatch.transaction.description || '')}&status=MATCHED`, '_blank'); }}
                                                                    className="shrink-0 p-1 rounded text-blue-600 hover:bg-blue-50" title="Ver match actual"
                                                                >
                                                                    <EyeIcon className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                        <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-2">Por proveedor</h4>
                                        <div className="flex gap-1.5 mb-2">
                                            <input type="text" value={providerSearch} onChange={e => setProviderSearch(e.target.value)} placeholder="Ej: Entel..." className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs min-w-0" />
                                            {selectedProvider && <button type="button" onClick={() => { setSelectedProvider(null); setProviderDtes([]); }} className="text-slate-500 shrink-0"><XMarkIcon className="h-4 w-4" /></button>}
                                        </div>
                                        {providerResultsLoading && <p className="text-[10px] text-slate-500">Buscando...</p>}
                                        {!selectedProvider && providerResults.length > 0 && (
                                            <div className="max-h-20 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-white">
                                                {providerResults.map((p: any) => (
                                                    <button key={p.id} type="button" onClick={() => setSelectedProvider(p)} className="w-full text-left px-2 py-1 hover:bg-indigo-50 text-xs font-medium text-slate-800 truncate">{p.name}</button>
                                                ))}
                                            </div>
                                        )}
                                        {selectedProvider && (
                                            <>
                                                <p className="text-[10px] text-slate-600 mb-1">DTEs de <strong>{selectedProvider.name}</strong></p>
                                                <div className="mb-1">
                                                    <input
                                                        type="text"
                                                        value={providerFolioFilter}
                                                        onChange={e => setProviderFolioFilter(e.target.value)}
                                                        placeholder="Filtrar por folio..."
                                                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                                                    />
                                                </div>
                                                {providerDtesLoading ? (
                                                    <p className="text-[10px] text-slate-500">Cargando...</p>
                                                ) : providerDtes.length === 0 ? (
                                                    <p className="text-[10px] text-slate-500">Sin pendientes</p>
                                                ) : (
                                                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100 bg-white">
                                                        {providerDtes
                                                            .filter((dte: any) =>
                                                                !providerFolioFilter ||
                                                                String(dte.folio).includes(providerFolioFilter.trim()),
                                                            )
                                                            .map((dte: any) => {
                                                                const isMatched = dte.hasMatch || (dte.matches && dte.matches.length > 0 && dte.matches.some((m: any) => m.status === 'CONFIRMED'));
                                                                const confirmedMatch = isMatched ? dte.matches?.find((m: any) => m.status === 'CONFIRMED') : null;
                                                                return (
                                                                    <div key={dte.id} className={`w-full px-2 py-1.5 flex items-center gap-2 text-xs ${isMatched ? 'bg-amber-50/50' : 'hover:bg-indigo-50'}`}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPendingReplaceDte({ dte, isReassign: isMatched })}
                                                                            disabled={replacingMatch}
                                                                            className="flex-1 min-w-0 text-left flex items-center gap-1.5 disabled:opacity-50"
                                                                        >
                                                                            <span>Folio {dte.folio}</span>
                                                                            {isMatched && (
                                                                                <span className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold">Ya asignado</span>
                                                                            )}
                                                                        </button>
                                                                        <span className="text-indigo-600 font-semibold shrink-0">{formatCurrency(dte.totalAmount)}</span>
                                                                        {isMatched && confirmedMatch?.transaction && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); window.open(`/cartolas?search=${encodeURIComponent(confirmedMatch.transaction.description || '')}&status=MATCHED`, '_blank'); }}
                                                                                className="shrink-0 p-1 rounded text-blue-600 hover:bg-blue-50" title="Ver match actual"
                                                                            >
                                                                                <EyeIcon className="h-3.5 w-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                </div>
                                            )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                            )}

                        {/* Confirmación: reemplazar match por DTE elegido */}
                        {reviewTx && reviewMatch && pendingReplaceDte && (() => {
                            const isReassign = pendingReplaceDte.isReassign;
                            const confirmedMatch = isReassign ? pendingReplaceDte.dte.matches?.find((m: any) => m.status === 'CONFIRMED') : null;
                            return (
                            <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10 rounded-2xl" onClick={() => setPendingReplaceDte(null)}>
                                <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
                                    <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
                                        {isReassign ? <ArrowsRightLeftIcon className="h-5 w-5 text-amber-600" /> : null}
                                        {isReassign ? 'Reasignar factura' : 'Confirmar nuevo match'}
                                    </h3>
                                    <p className="text-sm text-slate-600 mb-1">
                                        ¿Asignar este movimiento a <strong>Folio {pendingReplaceDte.dte.folio}</strong> de <strong>{pendingReplaceDte.dte.provider?.name || 'proveedor'}</strong>?
                                    </p>
                                    <p className="text-xs text-slate-500 mb-2">{formatCurrency(pendingReplaceDte.dte.totalAmount)}. Se reemplazará el match actual.</p>
                                    {isReassign && confirmedMatch?.transaction && (
                                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                                            <p className="text-xs text-amber-800 font-semibold mb-1">⚠️ Esta factura está asignada a otro movimiento:</p>
                                            <p className="text-xs text-amber-700">
                                                {confirmedMatch.transaction.description} — {formatCurrency(confirmedMatch.transaction.amount)}
                                            </p>
                                            <p className="text-[10px] text-amber-600 mt-1">
                                                Al reasignar, ese movimiento volverá a estado <strong>PENDIENTE</strong>.
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex gap-2 justify-end">
                                        <button type="button" onClick={() => setPendingReplaceDte(null)} className="px-3 py-2 border border-slate-200 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50">
                                            Cancelar
                                        </button>
                                        {isReassign && confirmedMatch?.transaction && (
                                            <button
                                                type="button"
                                                onClick={() => { window.open(`/cartolas?search=${encodeURIComponent(confirmedMatch.transaction.description || '')}&status=MATCHED`, '_blank'); }}
                                                className="px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-1"
                                            >
                                                <EyeIcon className="h-4 w-4" /> Ver match
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => isReassign ? handleReassignDte(pendingReplaceDte.dte) : handleReplaceWithDte(pendingReplaceDte.dte)}
                                            disabled={replacingMatch}
                                            className={`px-3 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-1 ${isReassign ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                        >
                                            {isReassign && <ArrowsRightLeftIcon className="h-4 w-4" />}
                                            {replacingMatch ? 'Procesando...' : isReassign ? 'Reasignar' : 'Asignar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            );
                        })()}

                        {/* Footer único: acciones según caso */}
                        <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3">
                            {reviewTx && reviewMatch && (
                            <>
                            {reviewMatch.status !== 'CONFIRMED' ? (
                                <>
                                    <button
                                        onClick={() => handleMatchAction('CONFIRMED')}
                                        disabled={reviewLoading}
                                        className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                                    >
                                        <CheckCircleIcon className="h-5 w-5" />
                                        Confirmar Match
                                    </button>
                                    <button
                                        onClick={() => handleMatchAction('REJECTED')}
                                        disabled={reviewLoading}
                                        className="flex-1 min-w-[140px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 hover:border-red-400 px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <XCircleIcon className="h-5 w-5" />
                                        Rechazar
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleDiscardMatch}
                                    disabled={reviewLoading}
                                    className="flex-1 min-w-[140px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 hover:border-red-400 px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    <XCircleIcon className="h-5 w-5" />
                                    Descartar match
                                </button>
                            )}
                            <button
                                onClick={closeCartolaModal}
                                disabled={reviewLoading || replacingMatch}
                                className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                                Cerrar
                            </button>
                        </>
                            )}
                            {suggestionModalId && (
                                <>
                                    <button
                                        onClick={handleAcceptSuggestion}
                                        disabled={suggestionActionLoading || (suggestionDetail?.type === 'SUM' && (suggestionDetail?.transactions || []).filter((tx: any) => !suggestionRemovedTxIds.includes(tx.id)).length + suggestionAddedTxIds.length === 0)}
                                        className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                                    >
                                        <CheckCircleIcon className="h-5 w-5" />
                                        Aceptar sugerencia
                                    </button>
                                    <button
                                        onClick={handleRejectSuggestion}
                                        disabled={suggestionActionLoading}
                                        className="flex-1 min-w-[140px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 hover:border-red-400 px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <XCircleIcon className="h-5 w-5" />
                                        Rechazar
                                    </button>
                                    {suggestionDetail && suggestionDetail.type === 'SPLIT' && (
                                        <button
                                            onClick={() => {
                                                setAnnotateTx(suggestionDetail.transaction);
                                                setAnnotateDteSelectedIds(suggestionDetail.dtes?.map((d: any) => d.id) || []);
                                                setSuggestionModalId(null);
                                                setSuggestionDetail(null);
                                            }}
                                            disabled={suggestionActionLoading}
                                            className="flex-1 min-w-[140px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-200 hover:border-indigo-400 px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                        >
                                            <PencilSquareIcon className="h-5 w-5" />
                                            Editar Manual
                                        </button>
                                    )}
                                    <button
                                        onClick={closeCartolaModal}
                                        disabled={suggestionActionLoading}
                                        className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                                    >
                                        Cerrar
                                    </button>
                                </>
                            )}
                            {annotateTx && !(reviewTx && reviewMatch) && !suggestionModalId && (
                                <>
                                    <button
                                        onClick={handleAnnotateSave}
                                        disabled={annotateLoading}
                                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/20"
                                    >
                                        {annotateLoading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />}
                                        Marcar como Revisado
                                    </button>
                                    <button
                                        onClick={closeCartolaModal}
                                        disabled={annotateLoading}
                                        className="px-5 py-3 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Body: Sugerencia (Sum/Split) — solo cuando este caso está abierto */}
                        {suggestionModalId && (
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            {suggestionDetailLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <ArrowPathIcon className="h-8 w-8 text-indigo-500 animate-spin" />
                                </div>
                            ) : suggestionDetail ? (
                                <>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {/* Panel Izquierdo: Movimientos Bancarios */}
                                        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 flex flex-col">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Movimiento(s) Bancario(s)</h3>
                                            </div>
                                            
                                            <div className="flex-1 overflow-auto min-h-0">
                                                {(suggestionDetail.transactions || []).length === 0 ? (
                                                    <p className="text-sm text-slate-500 italic">Sin movimientos</p>
                                                ) : (
                                                    <ul className="space-y-2">
                                                        {(suggestionDetail.transactions || []).map((tx: any) => {
                                                            const isRemoved = suggestionRemovedTxIds.includes(tx.id);
                                                            return (
                                                                <li key={tx.id} className={`text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0 ${isRemoved ? 'opacity-40 line-through bg-slate-100' : ''}`}>
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 min-w-0">
                                                                            <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(tx.date)}</p></div>
                                                                            <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-red-700">{formatCurrency(tx.amount)}</p></div>
                                                                            <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate text-[11px]" title={tx.description}>{tx.description}</p></div>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSuggestionRemovedTxIds((prev) => isRemoved ? prev.filter((id) => id !== tx.id) : [...prev, tx.id])}
                                                                            className="shrink-0 text-[10px] font-bold uppercase py-1 px-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600"
                                                                        >
                                                                            {isRemoved ? 'Vincular' : 'Quitar'}
                                                                        </button>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                        {/* Movimientos Añadidos */}
                                                        {suggestionOtherMovementsRut.filter(tx => suggestionAddedTxIds.includes(tx.id)).map((tx: any) => (
                                                            <li key={tx.id} className="text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0 bg-emerald-50/50 rounded px-1">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 min-w-0">
                                                                        <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-emerald-800">{formatDate(tx.date)}</p></div>
                                                                        <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-emerald-700">{formatCurrency(tx.amount)}</p></div>
                                                                        <div className="col-span-2"><p className="text-emerald-700 text-[10px] italic">Añadido manualmente</p></div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSuggestionAddedTxIds(prev => prev.filter(id => id !== tx.id))}
                                                                        className="shrink-0 text-[10px] font-bold uppercase py-1 px-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-emerald-600"
                                                                    >
                                                                        Quitar
                                                                    </button>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            <div className="mt-3 pt-3 border-t-2 border-slate-200 bg-white/50 p-2 rounded-lg">
                                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Movimientos</p>
                                                <p className="text-xl font-bold text-slate-800">
                                                    {(() => {
                                                        const effectiveTxs = (suggestionDetail.transactions || []).filter((tx: any) => !suggestionRemovedTxIds.includes(tx.id));
                                                        const addedTxs = suggestionOtherMovementsRut.filter((tx: any) => suggestionAddedTxIds.includes(tx.id));
                                                        return formatCurrency(effectiveTxs.reduce((s: number, tx: any) => s + Math.abs(Number(tx.amount)), 0)
                                                                            + addedTxs.reduce((s: number, tx: any) => s + Math.abs(Number(tx.amount)), 0));
                                                    })()}
                                                </p>
                                            </div>

                                            {/* Buscador de otros movimientos del mismo RUT */}
                                            {suggestionDetail.dte?.provider?.rut && (
                                                <div className="mt-4 pt-4 border-t border-slate-200">
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                                        <PlusIcon className="h-3 w-3" /> Otros movimientos a este RUT
                                                    </p>
                                                    {suggestionOtherMovementsRutLoading ? (
                                                        <p className="text-[10px] text-slate-400">Cargando movimientos...</p>
                                                    ) : suggestionOtherMovementsRut.filter(tx => !suggestionAddedTxIds.includes(tx.id)).length === 0 ? (
                                                        <p className="text-[10px] text-slate-400 italic">No hay más movimientos pendientes</p>
                                                    ) : (
                                                        <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                                            {suggestionOtherMovementsRut.filter(tx => !suggestionAddedTxIds.includes(tx.id)).map((tx: any) => (
                                                                <button
                                                                    key={tx.id}
                                                                    onClick={() => setSuggestionAddedTxIds(prev => [...prev, tx.id])}
                                                                    className="w-full text-left text-[10px] p-1.5 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200 transition-all flex justify-between items-center group"
                                                                >
                                                                    <div className="truncate flex-1">
                                                                        <span className="font-bold text-slate-700">{formatDate(tx.date)}</span>
                                                                        <span className="mx-1 text-slate-300">|</span>
                                                                        <span className="text-slate-600">{tx.description}</span>
                                                                    </div>
                                                                    <span className="font-bold text-red-600 group-hover:text-red-700 ml-2">{formatCurrency(tx.amount)}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Panel Derecho: Facturas DTE */}
                                        <div className="rounded-lg border border-indigo-200 p-4 bg-indigo-50/30 flex flex-col">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><DocumentChartBarIcon className="h-3.5 w-3.5 text-indigo-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Factura(s) (DTE)</h3>
                                            </div>
                                            
                                            <div className="flex-1 overflow-auto min-h-0">
                                                {(() => {
                                                    const initialDtes = suggestionDetail.type === 'SPLIT' 
                                                        ? (suggestionDetail.relatedDtes || []) 
                                                        : (suggestionDetail.dte ? [suggestionDetail.dte] : []);
                                                    
                                                    const effectiveDtes = initialDtes.filter((d: any) => !suggestionRemovedDteIds.includes(d.id));
                                                    const addedDtes = suggestionProviderUnpaidDtes.filter((d: any) => suggestionAddedDteIds.includes(d.id));
                                                    const allSelectedDtes = [...effectiveDtes, ...addedDtes];

                                                    return (
                                                        <>
                                                            {allSelectedDtes.length === 0 ? (
                                                                <p className="text-sm text-slate-500 italic mb-4">No hay facturas seleccionadas</p>
                                                            ) : (
                                                                <ul className="space-y-2">
                                                                    {initialDtes.map((dte: any) => {
                                                                        const isRemoved = suggestionRemovedDteIds.includes(dte.id);
                                                                        return (
                                                                            <li key={dte.id} className={`text-sm border-b border-indigo-100 pb-2 last:border-0 last:pb-0 ${isRemoved ? 'opacity-40 line-through bg-slate-50' : ''}`}>
                                                                                <div className="flex justify-between items-start gap-2">
                                                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 min-w-0">
                                                                                        <div><span className="text-[10px] text-slate-400 uppercase">Folio</span><p className="font-bold text-indigo-700">{dte.folio} T{dte.type}</p></div>
                                                                                        <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-indigo-700">{formatCurrency(dte.totalAmount)}</p></div>
                                                                                        <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase font-medium">Fecha Emisión</span><p className="text-slate-600 truncate text-[11px]">{formatDate(dte.issuedDate)}</p></div>
                                                                                    </div>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => setSuggestionRemovedDteIds(prev => isRemoved ? prev.filter(id => id !== dte.id) : [...prev, dte.id])}
                                                                                        className="shrink-0 text-[10px] font-bold uppercase py-1 px-1.5 rounded border border-indigo-200 hover:bg-indigo-100 text-indigo-600"
                                                                                    >
                                                                                        {isRemoved ? 'Vincular' : 'Quitar'}
                                                                                    </button>
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                    {addedDtes.map((dte: any) => (
                                                                        <li key={dte.id} className="text-sm border-b border-indigo-100 pb-2 last:border-0 last:pb-0 bg-emerald-50/50 rounded px-1">
                                                                            <div className="flex justify-between items-start gap-2">
                                                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 min-w-0">
                                                                                    <div><span className="text-[10px] text-slate-400 uppercase">Folio</span><p className="font-bold text-emerald-700">{dte.folio} T{dte.type}</p></div>
                                                                                    <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-emerald-700">{formatCurrency(dte.totalAmount)}</p></div>
                                                                                    <div className="col-span-2"><p className="text-emerald-700 text-[10px] italic">Añadida manualmente</p></div>
                                                                                </div>
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={() => setSuggestionAddedDteIds(prev => prev.filter(id => id !== dte.id))}
                                                                                    className="shrink-0 text-[10px] font-bold uppercase py-1 px-1.5 rounded border border-emerald-200 hover:bg-emerald-100 text-emerald-600"
                                                                                >
                                                                                    Quitar
                                                                                </button>
                                                                            </div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>

                                            <div className="mt-3 pt-3 border-t-2 border-indigo-200 bg-white/50 p-2 rounded-lg">
                                                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Facturas</p>
                                                <p className="text-xl font-black text-indigo-800">
                                                    {(() => {
                                                        const initialDtes = suggestionDetail.type === 'SPLIT' 
                                                            ? (suggestionDetail.relatedDtes || []) 
                                                            : (suggestionDetail.dte ? [suggestionDetail.dte] : []);
                                                        const effectiveDtes = initialDtes.filter((d: any) => !suggestionRemovedDteIds.includes(d.id));
                                                        const addedDtes = suggestionProviderUnpaidDtes.filter((d: any) => suggestionAddedDteIds.includes(d.id));
                                                        return formatCurrency([...effectiveDtes, ...addedDtes].reduce((s: number, dte: any) => s + Number(dte.totalAmount || 0), 0));
                                                    })()}
                                                </p>
                                            </div>

                                            {/* Selector de otros DTEs del mismo proveedor */}
                                            <div className="mt-4 pt-4 border-t border-slate-200">
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                                                    <MagnifyingGlassIcon className="h-3 w-3" /> Añadir otra factura del proveedor
                                                </p>
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val && !suggestionAddedDteIds.includes(val)) {
                                                            setSuggestionAddedDteIds(prev => [...prev, val]);
                                                        }
                                                    }}
                                                    className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    <option value="" disabled>Seleccionar factura...</option>
                                                    {suggestionProviderUnpaidDtesLoading ? (
                                                        <option disabled>Cargando facturas...</option>
                                                    ) : (
                                                        suggestionProviderUnpaidDtes
                                                            .filter(d => !suggestionAddedDteIds.includes(d.id) && !((suggestionDetail.relatedDtes || []).some((r: any) => r.id === d.id) || suggestionDetail.dte?.id === d.id))
                                                            .map((d: any) => (
                                                                <option key={d.id} value={d.id}>
                                                                    Folio {d.folio} (T{d.type}) — {formatCurrency(d.totalAmount)}
                                                                </option>
                                                            ))
                                                    )}
                                                </select>
                                                {suggestionProviderUnpaidDtes.length === 0 && !suggestionProviderUnpaidDtesLoading && (
                                                    <p className="text-[9px] text-slate-400 mt-1 italic italic">No hay más facturas pendientes para este proveedor</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Comparativa Final (Cuadratura) */}
                                    {(() => {
                                        const effectiveTxsSum = (suggestionDetail.transactions || []).filter((tx: any) => !suggestionRemovedTxIds.includes(tx.id));
                                        const addedTxsSum = suggestionOtherMovementsRut.filter((tx: any) => suggestionAddedTxIds.includes(tx.id));
                                        const totalMov = effectiveTxsSum.reduce((s: number, tx: any) => s + Math.abs(Number(tx.amount)), 0)
                                            + addedTxsSum.reduce((s: number, tx: any) => s + Math.abs(Number(tx.amount)), 0);

                                        const initialDtesS = suggestionDetail.type === 'SPLIT' ? (suggestionDetail.relatedDtes || []) : (suggestionDetail.dte ? [suggestionDetail.dte] : []);
                                        const effectiveDteS = initialDtesS.filter((d: any) => !suggestionRemovedDteIds.includes(d.id));
                                        const addedDteS = suggestionProviderUnpaidDtes.filter((d: any) => suggestionAddedDteIds.includes(d.id));
                                        const totalFacturas = [...effectiveDteS, ...addedDteS].reduce((s: number, dte: any) => s + Number(dte.totalAmount || 0), 0);

                                        const diff = totalMov - totalFacturas;
                                        const hasDiff = Math.abs(diff) > 2;

                                        return (
                                            <div className={`mt-6 p-4 rounded-xl border-2 transition-all ${hasDiff ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200 shadow-xl shadow-emerald-600/10'}`}>
                                                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                                    <div>
                                                        <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Cuadratura Final</h4>
                                                        <div className="flex items-center gap-4 md:gap-8">
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block uppercase font-bold">Banco</span>
                                                                <p className="text-xl font-bold text-slate-800 tracking-tight">{formatCurrency(totalMov)}</p>
                                                            </div>
                                                            <div className="text-slate-300 font-light text-3xl">−</div>
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block uppercase font-bold">Facturas</span>
                                                                <p className="text-xl font-bold text-indigo-700 tracking-tight">{formatCurrency(totalFacturas)}</p>
                                                            </div>
                                                            <div className="text-slate-300 font-light text-3xl">=</div>
                                                            <div>
                                                                <span className="text-[9px] text-slate-400 block uppercase font-bold">Diferencia</span>
                                                                <p className={`text-xl font-black tracking-tight ${hasDiff ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(diff)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-center md:text-right">
                                                        {hasDiff ? (
                                                            <>
                                                                <div className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full inline-block mb-1">Monto no coincide ⚠️</div>
                                                                <p className="text-[10px] text-amber-600 font-medium">Asegúrate de que la suma sea correcta <br/>antes de aceptar.</p>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-full inline-block mb-1 animate-pulse">Match Perfecto ✨</div>
                                                                <p className="text-[10px] text-emerald-600 font-medium">La conciliación está perfectamente <br/>cuadrada.</p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </>
                            ) : (
                                <p className="text-sm text-slate-500 py-4">No se pudo cargar la sugerencia.</p>
                            )}
                        </div>
                        )}

                        {/* Body: Anotar — mismo diseño 2 columnas (movimiento | concepto + matchear) */}
                        {annotateTx && !(reviewTx && reviewMatch) && !suggestionModalId && (
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Movimiento Bancario</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(annotateTx.date)}</p></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className={`font-bold ${annotateTx.type === 'CREDIT' ? 'text-green-600' : 'text-red-700'}`}>{formatCurrency(annotateTx.amount)}</p></div>
                                        <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate" title={annotateTx.description}>{annotateTx.description}</p></div>
                                        {annotateTx.bankAccount && <div className="col-span-2 text-xs text-slate-500">{annotateTx.bankAccount.bankName} — {annotateTx.bankAccount.accountNumber}</div>}
                                    </div>
                                </div>
                                <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                    Concepto / Motivo del gasto
                                </label>
                                <input
                                    type="text"
                                    value={annotateNote}
                                    onChange={e => setAnnotateNote(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && annotateNote.trim()) handleAnnotateSave(); }}
                                    placeholder="Ej: Despachos, Zapatillas, Compra insumos oficina..."
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                    autoFocus
                                />
                                {historicalNotes[annotateTx.description] && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setAnnotateNote(historicalNotes[annotateTx.description])}
                                            className="px-2 py-0.5 bg-amber-50 border border-amber-200 hover:border-amber-400 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-medium flex items-center shadow-sm transition-all"
                                        >
                                            💡 Sugerencia: {historicalNotes[annotateTx.description]}
                                        </button>
                                    </div>
                                )}
                                <p className="text-[10px] text-slate-400 mt-1.5">
                                    Al guardar, este movimiento se marcará como revisado.
                                </p>
                            </div>

                            <div className="border-t border-slate-200 pt-4">
                                <p className="text-xs font-semibold text-slate-600 mb-1.5">Asociar a Proveedor (Opcional)</p>
                                <p className="text-[10px] text-slate-500 mb-2">Si asocias un proveedor, futuros movimientos con esta descripción se auto-asignarán a él.</p>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={annotateProviderSearch}
                                        onChange={e => { setAnnotateProviderSearch(e.target.value); if(annotateProviderSelected) setAnnotateProviderSelected(null); }}
                                        placeholder="Buscar proveedor por nombre..."
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                                    />
                                    {annotateProviderResults.length > 0 && (
                                        <div className="absolute z-20 bg-white border border-slate-200 rounded-lg mt-1 w-full max-h-48 overflow-auto shadow-lg">
                                            {annotateProviderResults.map((p: any) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setAnnotateProviderSelected(p);
                                                        setAnnotateProviderSearch(p.name);
                                                        setAnnotateProviderResults([]);
                                                    }}
                                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                                                >
                                                    <span className="font-medium text-slate-700">{p.name}</span>
                                                    <span className="text-xs text-slate-400 ml-1">({p.rut})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-slate-200 pt-4">
                                <p className="text-xs font-semibold text-slate-600 mb-2">O matchear con factura</p>
                                <p className="text-[10px] text-slate-500 mb-2">Busca por folio (ej. 416423) o proveedor y vincula este movimiento a una factura.</p>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={annotateDteSearch}
                                        onChange={e => setAnnotateDteSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && searchAnnotateDtes()}
                                        placeholder="Folio o nombre proveedor..."
                                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                                    />
                                    <button type="button" onClick={searchAnnotateDtes} disabled={annotateDteLoading} className="px-2 py-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                                        <MagnifyingGlassIcon className="h-4 w-4" />
                                    </button>
                                </div>
                                {annotateDteResults.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 mb-2">
                                        {annotateDteResults.map((dte: any) => (
                                            <button
                                                key={dte.id}
                                                type="button"
                                                onClick={() => {
                                                    setAnnotateDteSelectedIds((prev) => 
                                                        prev.includes(dte.id) ? prev.filter(id => id !== dte.id) : [...prev, dte.id]
                                                    );
                                                }}
                                                className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-slate-100 last:border-0 ${annotateDteSelectedIds.includes(dte.id) ? 'bg-indigo-50 font-semibold' : ''}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="truncate">
                                                        <span className={`${annotateDteSelectedIds.includes(dte.id) ? 'text-indigo-600' : 'text-slate-800'}`}>Folio {dte.folio}</span>
                                                        <span className="text-slate-400 text-xs ml-1">· {dte.provider?.name ?? dte.rutIssuer}</span>
                                                    </div>
                                                    <span className={`font-bold ml-2 ${annotateDteSelectedIds.includes(dte.id) ? 'text-indigo-700' : 'text-slate-700'}`}>
                                                        {formatCurrency(dte.totalAmount)}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {annotateMatchError && <p className="text-xs text-red-600 mb-2">{annotateMatchError}</p>}
                                {annotateDteSelectedIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleAnnotateMatch}
                                        disabled={annotateMatchLoading}
                                        className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1 shadow-md shadow-indigo-600/10"
                                    >
                                        {annotateMatchLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                                        Matchear con {annotateDteSelectedIds.length} Factura(s)
                                    </button>
                                )}
                            </div>
                                </div>
                            </div>
                        </div>
                        )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Corregir tipo de movimiento (Cargo / Abono) - sin alert, error en modal; no recarga toda la página */}
            {correctTypeTx && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { if (!correctTypeSaving) { setCorrectTypeTx(null); setCorrectTypeError(null); } }}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Corregir tipo de movimiento</h3>
                        <p className="text-sm text-slate-600 mb-1">{correctTypeTx.description}</p>
                        <p className="text-xs text-slate-500 mb-2">
                            {formatDate(correctTypeTx.date)} · {formatCurrency(correctTypeTx.amount)}
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-4">
                            Al corregir se actualizan el tipo y el signo del monto. Los totales (Abonos/Cargos) y la conciliación se recalculan sin recargar la página. Si este movimiento tenía un match, revísalo.
                        </p>
                        {correctTypeError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {correctTypeError}
                            </div>
                        )}
                        <p className="text-sm text-slate-700 mb-3">Este movimiento está marcado como <strong>{correctTypeTx.type === 'CREDIT' ? 'ABONO' : 'CARGO'}</strong>. ¿Cómo debería ser?</p>
                        <div className="flex gap-3 mb-6">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!correctTypeTx) return;
                                    const txId = correctTypeTx.id;
                                    const oldAmount = correctTypeTx.amount;
                                    setCorrectTypeError(null);
                                    setCorrectTypeSaving(true);
                                    try {
                                        const url = `${API_URL}/transactions/${txId}/type`;
                                        const { authFetch } = await import('@/lib/auth');
                                        const res = await authFetch(url, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ type: 'CREDIT' }),
                                        });
                                        const data = await res.json().catch(() => ({}) as any);
                                        if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
                                        setCorrectTypeTx(null);
                                        setCorrectTypeError(null);
                                        // Optimistic: actualizar tipo y monto en la lista
                                        optimisticUpdate((list) =>
                                            list.map((tx) => {
                                                if (tx.id !== txId) return tx;
                                                const newAmount = tx.type === 'CREDIT' ? tx.amount : -tx.amount;
                                                return { ...tx, type: 'CREDIT' as const, amount: Math.abs(newAmount) };
                                            }),
                                        );
                                    } catch (e: any) {
                                        setCorrectTypeError(e?.message || 'No se pudo corregir. Comprueba que el backend esté en marcha (puerto correcto).');
                                    } finally {
                                        setCorrectTypeSaving(false);
                                    }
                                }}
                                disabled={correctTypeSaving || correctTypeTx.type === 'CREDIT'}
                                className={`flex-1 py-3 rounded-lg font-medium text-sm border-2 transition-colors ${correctTypeTx.type === 'CREDIT' ? 'border-green-300 bg-green-50 text-green-700 cursor-default' : 'border-green-200 bg-white text-green-700 hover:bg-green-50 border-green-400'}`}
                            >
                                Abono (entrada)
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!correctTypeTx) return;
                                    const txId = correctTypeTx.id;
                                    setCorrectTypeError(null);
                                    setCorrectTypeSaving(true);
                                    try {
                                        const url = `${API_URL}/transactions/${txId}/type`;
                                        const { authFetch: authFetch2 } = await import('@/lib/auth');
                                        const res = await authFetch2(url, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ type: 'DEBIT' }),
                                        });
                                        const data = await res.json().catch(() => ({}) as any);
                                        if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
                                        setCorrectTypeTx(null);
                                        setCorrectTypeError(null);
                                        // Optimistic: actualizar tipo y monto en la lista
                                        optimisticUpdate((list) =>
                                            list.map((tx) => {
                                                if (tx.id !== txId) return tx;
                                                const newAmount = tx.type === 'DEBIT' ? tx.amount : -tx.amount;
                                                return { ...tx, type: 'DEBIT' as const, amount: -Math.abs(newAmount) };
                                            }),
                                        );
                                    } catch (e: any) {
                                        setCorrectTypeError(e?.message || 'No se pudo corregir. Comprueba que el backend esté en marcha (puerto correcto).');
                                    } finally {
                                        setCorrectTypeSaving(false);
                                    }
                                }}
                                disabled={correctTypeSaving || correctTypeTx.type === 'DEBIT'}
                                className={`flex-1 py-3 rounded-lg font-medium text-sm border-2 transition-colors ${correctTypeTx.type === 'DEBIT' ? 'border-red-300 bg-red-50 text-red-700 cursor-default' : 'border-red-200 bg-white text-red-700 hover:bg-red-50 border-red-400'}`}
                            >
                                Cargo (salida)
                            </button>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => { setCorrectTypeTx(null); setCorrectTypeError(null); }}
                                disabled={correctTypeSaving}
                                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Corregir Monto de Transacción */}
            {correctAmountTx && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { if (!correctAmountSaving) { setCorrectAmountTx(null); setCorrectAmountError(null); } }}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Corregir monto de movimiento</h3>
                        <p className="text-sm text-slate-600 mb-1">{correctAmountTx.description}</p>
                        <p className="text-xs text-slate-500 mb-4">
                            {formatDate(correctAmountTx.date)} · {formatCurrency(correctAmountTx.amount)}
                        </p>
                        
                        {correctAmountError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {correctAmountError}
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nuevo Monto Absoluto (sin signo)</label>
                            <input 
                                type="number" 
                                value={correctAmountValue} 
                                onChange={e => setCorrectAmountValue(e.target.value)} 
                                placeholder="Ej: 3995570" 
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={() => { setCorrectAmountTx(null); setCorrectAmountError(null); }}
                                disabled={correctAmountSaving}
                                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!correctAmountTx || !correctAmountValue.trim()) return;
                                    const txId = correctAmountTx.id;
                                    const parsed = Number(correctAmountValue);
                                    if (isNaN(parsed) || parsed < 0) {
                                        setCorrectAmountError('Monto no válido. Introduce un número positivo.');
                                        return;
                                    }
                                    setCorrectAmountError(null);
                                    setCorrectAmountSaving(true);
                                    try {
                                        const finalAmount = correctAmountTx.type === 'DEBIT' ? -parsed : parsed;
                                        const url = `${API_URL}/transactions/${txId}/amount`;
                                        const { authFetch: authFetch3 } = await import('@/lib/auth');
                                        const res = await authFetch3(url, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ amount: finalAmount }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
                                        setCorrectAmountTx(null);
                                        // Optimistic update
                                        optimisticUpdate((list) =>
                                            list.map((tx) => tx.id === txId ? { ...tx, amount: finalAmount } : tx)
                                        );
                                    } catch (e: any) {
                                        setCorrectAmountError(e?.message || 'No se pudo guardar.');
                                    } finally {
                                        setCorrectAmountSaving(false);
                                    }
                                }}
                                disabled={correctAmountSaving}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                            >
                                {correctAmountSaving && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-800">Cargar Nueva Cartola</h2>
                                            <button onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadResult(null); setUploadForceReplace(false); }} className="text-slate-400 hover:text-slate-600">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-8 text-center space-y-6">
                            {uploadResult ? (
                                <div className="space-y-4">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${uploadResult.status === 'ok' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                                        {uploadResult.status === 'ok'
                                            ? <CheckCircleIcon className="h-8 w-8 text-emerald-600" />
                                            : <XCircleIcon className="h-8 w-8 text-red-600" />}
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-800">
                                        {uploadResult.status === 'ok' ? 'Cartola procesada' : 'Error al procesar'}
                                    </h3>
                                    {uploadResult.insertedRows !== undefined && (
                                        <p className="text-3xl font-bold text-indigo-600">{uploadResult.insertedRows} <span className="text-sm font-medium text-slate-500">movimientos insertados</span></p>
                                    )}
                                    {uploadResult.message && (
                                        <p className="text-sm text-red-600">{uploadResult.message}</p>
                                    )}
                                    <button
                                        onClick={() => {
                                            setShowUploadModal(false);
                                            setUploadFile(null);
                                            setUploadResult(null);
                                            refreshData();
                                            globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium w-full"
                                    >
                                        Cerrar y ver movimientos
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                                        <CloudArrowUpIcon className="h-8 w-8 text-purple-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-800">Subir archivo de banco</h3>
                                        <p className="text-sm text-slate-500 mt-1">PDF, Excel (.xlsx) o CSV. Se procesará con IA para extraer los movimientos.</p>
                                    </div>

                                    {/* Selector de Cuenta Bancaria */}
                                    <div className="text-left space-y-2">
                                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                                            ¿A qué cuenta pertenece este archivo?
                                        </label>
                                        <select
                                            value={uploadBankAccountId}
                                            onChange={(e) => setUploadBankAccountId(e.target.value)}
                                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium bg-white shadow-sm"
                                        >
                                            <option value="">-- Seleccionar cuenta (Opcional) --</option>
                                            {bankAccounts.map((acc: any) => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.bankName} - {acc.accountNumber}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400 italic">
                                            Si no seleccionas ninguna, el sistema intentará identificarla por el nombre o contenido del archivo.
                                        </p>
                                    </div>

                                    <div
                                        className={`border-2 border-dashed rounded-xl p-8 transition-colors cursor-pointer ${dragOver ? 'border-purple-500 bg-purple-50' : uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-purple-400 bg-slate-50'}`}
                                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
                                        onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,.xlsx,.xls,.csv'; input.onchange = (e: any) => { if (e.target.files[0]) setUploadFile(e.target.files[0]); }; input.click(); }}
                                    >
                                        {uploadFile ? (
                                            <div>
                                                <CheckCircleIcon className="h-10 w-10 text-emerald-500 mx-auto" />
                                                <p className="text-sm font-semibold text-slate-800 mt-3">{uploadFile.name}</p>
                                                <p className="text-[10px] text-slate-500 mt-1">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <CloudArrowUpIcon className="h-10 w-10 text-slate-300 mx-auto" />
                                                <p className="text-sm font-medium text-slate-600 mt-4">Arrastra o haz clic para seleccionar</p>
                                                <p className="text-[10px] text-slate-400 mt-1">                                                .pdf, .xlsx, .xls, .csv (máx 20 MB)</p>
                                            </div>
                                        )}
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer text-left">
                                        <input
                                            type="checkbox"
                                            checked={uploadForceReplace}
                                            onChange={e => setUploadForceReplace(e.target.checked)}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-slate-700">Forzar recarga</span>
                                    </label>
                                    <p className="text-xs text-slate-500 text-left">Si el archivo ya fue cargado antes, marca esto para eliminar los movimientos previos y volver a procesarlo (ej. Santander Enero 2026).</p>
                                    <div className="flex space-x-3">
                                        <button
                                            disabled={!uploadFile || uploading}
                                            onClick={async () => {
                                                if (!uploadFile) return;
                                                setUploading(true);
                                                ingestion.startIngestion(uploadFile.name);
                                                setShowUploadModal(false);
                                                setUploadFile(null);
                                                setUploadResult(null);
                                                const apiUrl = getApiUrl();
                                                try {
                                                    const formData = new FormData();
                                                    formData.append('file', uploadFile);
                                                    if (uploadForceReplace) formData.append('replace', '1');
                                                    if (uploadBankAccountId) formData.append('bankAccountId', uploadBankAccountId);
                                                    const res = await authFetch(`${apiUrl}/ingestion/cartolas/upload`, { method: 'POST', body: formData });
                                                    const data = await res.json();

                                                    if (data.status === 'ok') {
                                                        ingestion.setStep('matching');
                                                        try {
                                                            await authFetch(`${apiUrl}/conciliacion/run-auto-match`, {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    fromDate: periodDates.fromDate,
                                                                    toDate: periodDates.toDate,
                                                                    syncFromSources: false,
                                                                    organizationId: user?.organizationId,
                                                                }),
                                                            });
                                                        } catch (_) { /* match en segundo plano */ }
                                                        ingestion.setStep('done');
                                                        ingestion.setResult({ insertedRows: data.insertedRows ?? 0 });
                                                        refreshData();
                                                        globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
                                                    } else if (data.status === 'skipped') {
                                                        ingestion.setStep('done');
                                                        ingestion.setResult({ insertedRows: 0, message: data.message } as any);
                                                        refreshData();
                                                        globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
                                                    } else if (data.status === 'error' || data.status === 'warning') {
                                                        ingestion.setStep('error');
                                                        ingestion.setResult({ errorMessage: data.message || 'Error al procesar' });
                                                    } else {
                                                        ingestion.setStep('done');
                                                        ingestion.setResult({ insertedRows: data.insertedRows ?? 0 });
                                                        refreshData();
                                                        globalMutate((k: string) => typeof k === 'string' && (k.includes('/conciliacion/') || k.includes('/transactions')));
                                                    }
                                                } catch (err: any) {
                                                    const msg = err?.message || 'Error de red';
                                                    const friendly = msg === 'Failed to fetch'
                                                        ? 'No se pudo conectar con el servidor. Comprueba tu conexión a internet o que el servicio de API esté disponible.'
                                                        : msg;
                                                    ingestion.setStep('error');
                                                    ingestion.setResult({ errorMessage: friendly });
                                                } finally {
                                                    setUploading(false);
                                                }
                                            }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium w-full disabled:opacity-50 flex items-center justify-center"
                                        >
                                            {uploading ? (
                                                <>
                                                    <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                                                    Subir y procesar
                                                </>
                                            ) : 'Subir y procesar (puedes navegar mientras se procesa)'}
                                        </button>
                                        <button onClick={() => { setShowUploadModal(false); setUploadFile(null); setUploadForceReplace(false); }} className="px-6 py-3 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50 w-full">
                                            Cancelar
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
