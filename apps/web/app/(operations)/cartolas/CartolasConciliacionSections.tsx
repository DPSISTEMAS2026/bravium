'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    SparklesIcon,
    HandThumbUpIcon,
    HandThumbDownIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    PlusCircleIcon,
    LinkIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

export function CartolasSuggestionsSection({
    API_URL,
    onRefresh,
    formatCurrency,
    formatDate,
}: {
    API_URL: string;
    onRefresh: () => void;
    formatCurrency: (n: number) => string;
    formatDate: (s: string) => string;
}) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [rejectModal, setRejectModal] = useState<{ id: string; open: boolean }>({ id: '', open: false });
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/conciliacion/suggestions?status=PENDING`);
            if (res.ok) setSuggestions(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [API_URL]);

    useEffect(() => { load(); }, [load]);

    const handleAccept = async (id: string) => {
        setBusy(id);
        try {
            const res = await fetch(`${API_URL}/conciliacion/suggestions/${id}/accept`, { method: 'POST' });
            if (res.ok) { await load(); onRefresh(); }
        } finally { setBusy(null); }
    };

    const handleReject = async () => {
        const id = rejectModal.id;
        setRejectModal({ id: '', open: false });
        setBusy(id);
        try {
            await fetch(`${API_URL}/conciliacion/suggestions/${id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: rejectReason || 'Rechazada por usuario' }),
            });
            await load();
        } finally { setBusy(null); }
    };

    if (loading) {
        return (
            <div className="py-4 text-center text-slate-500 text-sm">Cargando sugerencias...</div>
        );
    }
    if (suggestions.length === 0) {
        return (
            <div className="py-4 text-center text-slate-500 text-sm bg-white rounded-lg border border-slate-200">
                Sin sugerencias pendientes. Ejecuta la conciliación para generarlas.
            </div>
        );
    }

    return (
        <>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {suggestions.map((s: any) => (
                        <SuggestionRow
                            key={s.id}
                            suggestion={s}
                            busy={busy === s.id}
                            onAccept={() => handleAccept(s.id)}
                            onReject={() => setRejectModal({ id: s.id, open: true })}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    ))}
                </div>
            </div>
            {rejectModal.open && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRejectModal({ id: '', open: false })}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-slate-800 mb-3">Rechazar sugerencia</h3>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            placeholder="Motivo (opcional)..." rows={3}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 mb-4" />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setRejectModal({ id: '', open: false })} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">Cancelar</button>
                            <button onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">Rechazar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function SuggestionRow({ suggestion: s, busy, onAccept, onReject, formatCurrency, formatDate }: {
    suggestion: any; busy: boolean; onAccept: () => void; onReject: () => void;
    formatCurrency: (n: number) => string; formatDate: (s: string) => string;
}) {
    const [expanded, setExpanded] = useState(false);
    const transactions = (s.transactions || []) as any[];
    const relatedDtes = (s.relatedDtes || []) as any[];
    const isSplit = s.type === 'SPLIT';
    const firstTx = transactions[0];
    const txTotal = transactions.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
    const dteTotal = isSplit
        ? relatedDtes.reduce((sum: number, d: any) => sum + Math.abs(d.totalAmount), 0)
        : Math.abs(s.dte?.totalAmount || 0);
    const providerName = s.dte?.provider?.name || 'Sin proveedor';
    const folio = s.dte?.folio ?? relatedDtes[0]?.folio;
    const dteType = s.dte?.type ?? relatedDtes[0]?.type;

    return (
        <div className="hover:bg-slate-50/50 transition-colors">
            <div className="flex items-stretch gap-4 px-4 py-3">
                {/* Mismo formato que la tabla de movimientos: Fecha | Descripción | Monto */}
                <div className="flex-1 min-w-0 flex items-center gap-4 flex-wrap">
                    <div className="font-medium text-slate-900 whitespace-nowrap text-sm">
                        {firstTx ? formatDate(firstTx.date) : '—'}
                    </div>
                    <div className="min-w-0 flex-1 max-w-md">
                        <div className="truncate text-slate-700 font-medium text-sm" title={firstTx?.description}>
                            {firstTx?.description || '—'}
                        </div>
                        {transactions.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setExpanded(!expanded)}
                                className="text-[10px] text-blue-600 hover:underline mt-0.5 flex items-center gap-0.5"
                            >
                                {expanded ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
                                {transactions.length} movimiento{transactions.length !== 1 ? 's' : ''}
                            </button>
                        )}
                    </div>
                    <div className="text-right font-bold text-slate-900 whitespace-nowrap text-sm">
                        {firstTx ? formatCurrency(firstTx.amount) : formatCurrency(txTotal)}
                    </div>
                </div>
                {/* Caja SUGERENCIA como en la tabla: ícono + empresa + folio + score + Aceptar/Rechazar */}
                <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex flex-col items-center text-center rounded-lg border-2 border-blue-200 bg-blue-50/80 px-3 py-2 min-w-[140px]">
                        <span className="inline-flex items-center text-blue-600 font-bold text-xs mb-1">
                            <ClockIcon className="h-3.5 w-3.5 mr-1" />
                            SUGERENCIA
                        </span>
                        <div className="text-[11px] text-slate-700 font-semibold leading-tight">
                            {providerName}
                        </div>
                        {folio != null && (
                            <div className="text-[10px] text-indigo-500 font-medium">
                                Folio {folio}{dteType != null ? ` (T${dteType})` : ''}
                            </div>
                        )}
                        <div className="text-[10px] text-blue-500 font-medium">
                            Score: {(s.confidence * 100).toFixed(0)}%
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={onAccept} disabled={busy} className="px-2 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
                            <HandThumbUpIcon className="h-3.5 w-3" /> Aceptar
                        </button>
                        <button onClick={onReject} disabled={busy} className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 disabled:opacity-50 flex items-center gap-1">
                            <HandThumbDownIcon className="h-3.5 w-3" /> Rechazar
                        </button>
                    </div>
                </div>
            </div>
            {expanded && transactions.length > 1 && (
                <div className="px-4 pb-3 pt-0 border-t border-slate-100 bg-slate-50/50">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Movimientos</div>
                    {transactions.map((tx: any) => (
                        <div key={tx.id} className="flex items-center gap-3 text-xs text-slate-600 py-0.5">
                            <span className="whitespace-nowrap">{formatDate(tx.date)}</span>
                            <span className="truncate flex-1">{tx.description}</span>
                            <span className="font-semibold">{formatCurrency(tx.amount)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function CartolasManualMatchSection({
    API_URL,
    onRefresh,
    formatCurrency,
    formatDate,
}: {
    API_URL: string;
    onRefresh: () => void;
    formatCurrency: (n: number) => string;
    formatDate: (s: string) => string;
}) {
    const [txSearch, setTxSearch] = useState('');
    const [dteSearch, setDteSearch] = useState('');
    const [pendingTxs, setPendingTxs] = useState<any[]>([]);
    const [unpaidDtes, setUnpaidDtes] = useState<any[]>([]);
    const [selectedTx, setSelectedTx] = useState<any>(null);
    const [selectedDte, setSelectedDte] = useState<any>(null);
    const [creating, setCreating] = useState(false);
    const [txLoading, setTxLoading] = useState(false);
    const [dteLoading, setDteLoading] = useState(false);

    const searchTxs = async () => {
        if (!txSearch.trim()) return;
        setTxLoading(true);
        try {
            const params = new URLSearchParams({ search: txSearch, status: 'PENDING', limit: '20' });
            const res = await fetch(`${API_URL}/transactions?${params}`);
            if (res.ok) {
                const data = await res.json();
                setPendingTxs(Array.isArray(data) ? data : data.data || []);
            }
        } catch { /* ignore */ }
        finally { setTxLoading(false); }
    };

    const searchDtes = async () => {
        if (!dteSearch.trim()) return;
        setDteLoading(true);
        try {
            const params = new URLSearchParams({ search: dteSearch, paymentStatus: 'UNPAID', limit: '20' });
            const res = await fetch(`${API_URL}/dtes?${params}`);
            if (res.ok) {
                const data = await res.json();
                setUnpaidDtes(Array.isArray(data) ? data : data.data || []);
            }
        } catch { /* ignore */ }
        finally { setDteLoading(false); }
    };

    const createManualMatch = async () => {
        if (!selectedTx || !selectedDte) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: selectedTx.id, dteId: selectedDte.id }),
            });
            if (res.ok) {
                setSelectedTx(null);
                setSelectedDte(null);
                setPendingTxs([]);
                setUnpaidDtes([]);
                setTxSearch('');
                setDteSearch('');
                onRefresh();
            }
        } catch { /* ignore */ }
        finally { setCreating(false); }
    };

    return React.createElement('div', { className: 'bg-white rounded-lg border border-slate-200 overflow-hidden p-4' }, 'Crear match manual — busca transacción pendiente y factura sin pagar.');
}
