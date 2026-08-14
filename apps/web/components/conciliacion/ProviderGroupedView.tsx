'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { apiFetcher } from '@/lib/api';
import {
    ChevronDownIcon,
    ChevronUpIcon,
    BuildingOffice2Icon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    DocumentTextIcon,
    BanknotesIcon,
    LinkIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);

const formatDate = (s: any) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface ProviderGroupedViewProps {
    API_URL: string;
    fromDate?: string;
    toDate?: string;
    onOpenModal: (txs: any[], dtes: any[], provider?: any) => void;
    onRefreshParent?: () => void;
}

export function ProviderGroupedView({
    API_URL,
    fromDate,
    toDate,
    onOpenModal,
    onRefreshParent,
}: ProviderGroupedViewProps) {
    const [search, setSearch] = useState('');
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
    const [filterTab, setFilterTab] = useState<'1TO1' | 'ALL' | 'NO_DTE'>('1TO1');
    const [isBatchSaving, setIsBatchSaving] = useState(false);

    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);

    const { data, error, mutate, isValidating } = useSWR(
        `${API_URL}/conciliacion/grouped-summary?${params.toString()}`,
        apiFetcher
    );

    const toggleExpand = (groupId: string) => {
        setExpandedGroupIds(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    if (error) {
        return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-slate-700">
                Error al cargar el resumen contable. <button onClick={() => mutate()} className="underline font-semibold text-slate-900">Reintentar</button>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                <ArrowPathIcon className="h-8 w-8 text-slate-600 animate-spin mx-auto mb-3" />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Cargando resumen de movimientos por RUT y proveedor...</p>
            </div>
        );
    }

    const groups: any[] = data.groups || [];

    // Pre-procesar cada grupo para calcular coincidencias 1:1 exactas
    const processedGroups = groups.map(grp => {
        const dteAmountMap = new Map<number, any[]>();
        (grp.pendingDtes || []).forEach((d: any) => {
            const amt = Math.abs(d.totalAmount || 0);
            if (!dteAmountMap.has(amt)) dteAmountMap.set(amt, []);
            dteAmountMap.get(amt)!.push(d);
        });

        const exactMatches: { tx: any; dte: any }[] = [];
        const matchedDteIds = new Set<string>();

        (grp.transactions || []).forEach((tx: any) => {
            const txAmt = Math.abs(tx.amount || 0);
            const dbMatchDteId = tx.matches?.[0]?.dteId;
            let matchedDte = null;

            if (dbMatchDteId) {
                matchedDte = (grp.pendingDtes || []).find((d: any) => d.id === dbMatchDteId);
            }

            if (!matchedDte) {
                const availableDtes = dteAmountMap.get(txAmt) || [];
                matchedDte = availableDtes.find(d => !matchedDteIds.has(d.id));
            }

            if (matchedDte) {
                matchedDteIds.add(matchedDte.id);
                exactMatches.push({ tx, dte: matchedDte });
            }
        });

        return {
            ...grp,
            exactMatches,
            exactMatchCount: exactMatches.length,
            match1to1DteIds: matchedDteIds,
            match1to1TxIds: new Set(exactMatches.map(m => m.tx.id)),
        };
    });

    // Total de parejas 1:1 globales listas para aprobar en 1 clic
    const allGlobalExactMatches: { tx: any; dte: any }[] = [];
    processedGroups.forEach(g => allGlobalExactMatches.push(...g.exactMatches));

    const handleApproveAll1to1Global = async () => {
        if (allGlobalExactMatches.length === 0) return;
        setIsBatchSaving(true);
        try {
            const { authFetch } = await import('@/lib/api');
            for (const p of allGlobalExactMatches) {
                await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transactionIds: [p.tx.id],
                        dteIds: [p.dte.id],
                        notes: 'Auto-Conciliado 1:1 por RUT y Monto'
                    })
                });
            }
            mutate();
            if (onRefreshParent) onRefreshParent();
        } catch (err: any) {
            alert(`Error al aprobar todas las coincidencias: ${err.message}`);
        } finally {
            setIsBatchSaving(false);
        }
    };

    const filteredGroups = processedGroups
        .filter(g => {
            // Filtro por pestaña
            if (filterTab === '1TO1' && g.exactMatchCount === 0) return false;
            if (filterTab === 'NO_DTE' && g.pendingDteCount > 0) return false;

            // Búsqueda por texto
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
                g.groupName?.toLowerCase().includes(q) ||
                g.rut?.toLowerCase().includes(q) ||
                g.transactions?.some((t: any) => t.description?.toLowerCase().includes(q))
            );
        })
        .sort((a, b) => {
            // PRIMERO: Grupos que tienen coincidencias 1:1 por aprobar al principio de la lista!
            if (a.exactMatchCount > 0 && b.exactMatchCount === 0) return -1;
            if (a.exactMatchCount === 0 && b.exactMatchCount > 0) return 1;

            if (b.exactMatchCount !== a.exactMatchCount) return b.exactMatchCount - a.exactMatchCount;

            const aHasBoth = a.transactionCount > 0 && a.pendingDteCount > 0;
            const bHasBoth = b.transactionCount > 0 && b.pendingDteCount > 0;

            if (aHasBoth && !bHasBoth) return -1;
            if (!aHasBoth && bHasBoth) return 1;

            return b.totalAmount - a.totalAmount;
        });

    return (
        <div className="space-y-4 font-sans">
            {/* Master Banner si existen coincidencias 1:1 globales sin scroll */}
            {allGlobalExactMatches.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-2 rounded-lg text-amber-800 border border-amber-300 shrink-0">
                            <CheckCircleSolid className="h-5 w-5 text-amber-700" />
                        </div>
                        <div>
                            <h3 className="text-xs font-extrabold text-amber-950 uppercase tracking-wider">
                                {allGlobalExactMatches.length} Coincidencias 1:1 Identificadas en el Periodo
                            </h3>
                            <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                                Movimientos bancarios con RUT y Monto ($CLP) idéntico a sus facturas DTEs correspondientes.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleApproveAll1to1Global}
                        disabled={isBatchSaving}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-2 shrink-0 border border-emerald-600 disabled:opacity-50"
                    >
                        {isBatchSaving ? (
                            <ArrowPathIcon className="h-4 w-4 animate-spin text-white" />
                        ) : (
                            <CheckCircleSolid className="h-4 w-4 text-emerald-200" />
                        )}
                        <span>{isBatchSaving ? 'Aprobando...' : `Aprobar Todas (${allGlobalExactMatches.length}) en 1 Clic`}</span>
                    </button>
                </div>
            )}

            {/* Control Bar: Pestañas Rápidas + Búsqueda */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                    <button
                        type="button"
                        onClick={() => setFilterTab('1TO1')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            filterTab === '1TO1'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                    >
                        <CheckCircleSolid className="h-3.5 w-3.5 text-amber-400" />
                        <span>Coincidencias 1:1 ({allGlobalExactMatches.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterTab('ALL')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            filterTab === 'ALL'
                                ? 'bg-slate-900 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                    >
                        <BuildingOffice2Icon className="h-3.5 w-3.5" />
                        <span>Todos los Grupos ({groups.length})</span>
                    </button>
                </div>

                <div className="relative flex-1 max-w-md w-full">
                    <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por RUT, Razón Social o Glosa de Cartola..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
                    />
                </div>
            </div>

            {/* List of Group Cards */}
            {filteredGroups.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs font-medium">
                    No se encontraron registros para los criterios de búsqueda.
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredGroups.map((grp, idx) => {
                        const isExpanded = expandedGroupIds.has(grp.groupId);
                        const hasDtes = grp.pendingDteCount > 0;

                        // ── Detección de Coincidencias 1:1 por Monto y RUT ──
                        const dteAmountMap = new Map<number, any[]>();
                        (grp.pendingDtes || []).forEach((d: any) => {
                            const amt = Math.abs(d.totalAmount || 0);
                            if (!dteAmountMap.has(amt)) dteAmountMap.set(amt, []);
                            dteAmountMap.get(amt)!.push(d);
                        });

                        const exactMatches: { tx: any; dte: any }[] = [];
                        const matchedDteIds = new Set<string>();

                        (grp.transactions || []).forEach((tx: any) => {
                            const txAmt = Math.abs(tx.amount || 0);
                            const dbMatchDteId = tx.matches?.[0]?.dteId;
                            let matchedDte = null;

                            if (dbMatchDteId) {
                                matchedDte = (grp.pendingDtes || []).find((d: any) => d.id === dbMatchDteId);
                            }

                            if (!matchedDte) {
                                const availableDtes = dteAmountMap.get(txAmt) || [];
                                matchedDte = availableDtes.find(d => !matchedDteIds.has(d.id));
                            }

                            if (matchedDte) {
                                matchedDteIds.add(matchedDte.id);
                                exactMatches.push({ tx, dte: matchedDte });
                            }
                        });

                        const exactMatchCount = exactMatches.length;
                        const match1to1DteIds = matchedDteIds;
                        const match1to1TxIds = new Set(exactMatches.map(m => m.tx.id));

                        return (
                            <GroupCard
                                key={`${grp.groupId}-${idx}`}
                                grp={grp}
                                isExpanded={isExpanded}
                                hasDtes={hasDtes}
                                exactMatchCount={exactMatchCount}
                                exactMatches={exactMatches}
                                match1to1TxIds={match1to1TxIds}
                                match1to1DteIds={match1to1DteIds}
                                toggleExpand={() => toggleExpand(grp.groupId)}
                                onOpenModal={onOpenModal}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Componente de Tarjeta de Grupo con Badges Verdes y Visto ──
function GroupCard({
    grp,
    isExpanded,
    hasDtes,
    exactMatchCount,
    exactMatches,
    match1to1TxIds,
    match1to1DteIds,
    toggleExpand,
    onOpenModal,
}: {
    grp: any;
    isExpanded: boolean;
    hasDtes: boolean;
    exactMatchCount: number;
    exactMatches: { tx: any; dte: any }[];
    match1to1TxIds: Set<string>;
    match1to1DteIds: Set<string>;
    toggleExpand: () => void;
    onOpenModal: (txs: any[], dtes: any[], provider?: any) => void;
}) {
    const [hoveredTxId, setHoveredTxId] = useState<string | null>(null);

    // Mapas para lookup rápido del par correspondiente
    const txToDteMap = new Map<string, any>();
    const dteToTxMap = new Map<string, any>();
    exactMatches.forEach(m => {
        txToDteMap.set(m.tx.id, m.dte);
        dteToTxMap.set(m.dte.id, m.tx);
    });

    // 1. Separar transacciones matcheadas y no matcheadas
    const matchedTxs = (grp.transactions || []).filter((t: any) => match1to1TxIds.has(t.id));
    const unmatchedTxs = (grp.transactions || []).filter((t: any) => !match1to1TxIds.has(t.id));

    // Ordenar transacciones matcheadas por fecha desc
    matchedTxs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    unmatchedTxs.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const sortedTransactions = [...matchedTxs, ...unmatchedTxs];

    // 2. Ordenar DTEs: Colocar a la derecha el DTE exacto que corresponde a cada transferencia en la misma fila!
    const pairedDtes = matchedTxs.map((tx: any) => txToDteMap.get(tx.id)).filter(Boolean);
    const unpairedDtes = (grp.pendingDtes || []).filter((d: any) => !match1to1DteIds.has(d.id));
    unpairedDtes.sort((a: any, b: any) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime());

    const sortedDtes = [...pairedDtes, ...unpairedDtes];

    return (
        <div
            className={`bg-white border rounded-xl overflow-hidden transition-all duration-150 ${
                isExpanded ? 'border-slate-400 shadow-md ring-1 ring-slate-900/5' : 'border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
        >
            {/* Header Row */}
            <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white border-b border-slate-100">
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0 tracking-wider">
                        {grp.provider ? grp.groupName.slice(0, 2).toUpperCase() : grp.rut ? 'RUT' : 'MOV'}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-slate-900 text-sm tracking-tight truncate">{grp.groupName}</h3>
                            {grp.rut && (
                                <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                                    RUT: {grp.rut}
                                </span>
                            )}
                            {exactMatchCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300 shadow-2xs">
                                    <CheckCircleSolid className="h-3.5 w-3.5 text-amber-700" />
                                    <span>{exactMatchCount} de {grp.transactionCount} Coincidencias 1:1 por Confirmar</span>
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium flex-wrap">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                                <BanknotesIcon className="h-3.5 w-3.5 text-slate-600" />
                                {grp.transactionCount} {grp.transactionCount === 1 ? 'movimiento' : 'movimientos'}
                            </span>

                            {hasDtes ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    <DocumentTextIcon className="h-3.5 w-3.5 text-slate-700" />
                                    {grp.pendingDteCount} DTEs pendientes ({formatCurrency(grp.pendingDteTotal)})
                                </span>
                            ) : (
                                <span className="text-slate-400 italic text-[11px]">Sin DTEs registrados en periodo</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Amounts & Action Buttons */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                    <div className="text-right pr-2">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Bancario</div>
                        <div className="text-base font-extrabold text-slate-900 font-mono tracking-tight">
                            {formatCurrency(grp.totalAmount)}
                        </div>
                    </div>

                    {exactMatchCount > 0 ? (
                        <button
                            onClick={() => onOpenModal([], grp.pendingDtes, grp.provider)}
                            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
                            title="Confirmar conciliaciones 1:1 de monto exacto e identificadas"
                        >
                            <CheckCircleSolid className="h-4 w-4 text-emerald-200" />
                            <span>Confirmar Conciliaciones ({exactMatchCount})</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => onOpenModal([], [], grp.provider || { name: grp.groupName, rut: grp.rut })}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-2 shrink-0"
                        >
                            <LinkIcon className="h-3.5 w-3.5" />
                            <span>Conciliación Manual</span>
                        </button>
                    )}

                    <button
                        onClick={toggleExpand}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Ver detalle de movimientos y DTEs"
                    >
                        {isExpanded ? (
                            <ChevronUpIcon className="h-4 w-4" />
                        ) : (
                            <ChevronDownIcon className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Expanded Accordion Detail */}
            {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Left Column: Bank Transactions List */}
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                                <span>Movimientos Bancarios ({grp.transactions.length})</span>
                                <span className="font-mono text-slate-900">{formatCurrency(grp.totalAmount)}</span>
                            </div>
                            <div className="space-y-2 max-h-96 overflow-y-auto pr-1 divide-y divide-slate-100">
                                {sortedTransactions.map((tx: any, idx: number) => {
                                    const is1to1 = match1to1TxIds.has(tx.id);
                                    const matchedDte = txToDteMap.get(tx.id);
                                    const isHovered = hoveredTxId === tx.id || (hoveredTxId && matchedDte && txToDteMap.get(hoveredTxId)?.id === matchedDte.id);

                                    return (
                                        <div
                                            key={`${tx.id}-${idx}`}
                                            onMouseEnter={() => setHoveredTxId(tx.id)}
                                            onMouseLeave={() => setHoveredTxId(null)}
                                            onClick={() => onOpenModal([tx], matchedDte ? [matchedDte] : [], grp.provider || { name: grp.groupName, rut: grp.rut })}
                                            title="Haga clic para conciliar manualmente esta transferencia contra las facturas del proveedor"
                                            className={`pt-2.5 pb-2 px-2.5 text-xs flex justify-between items-center rounded-lg transition-all cursor-pointer ${
                                                isHovered
                                                    ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/50'
                                                    : is1to1
                                                    ? 'bg-amber-50/50 border border-amber-200 hover:border-amber-400 shadow-2xs'
                                                    : 'bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="min-w-0 pr-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {is1to1 && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded-full shadow-xs shrink-0">
                                                            <CheckCircleSolid className="h-3 w-3 text-amber-200" />
                                                            <span>Coincidencia 1:1</span>
                                                        </span>
                                                    )}
                                                    <span className="font-semibold text-slate-900 truncate" title={tx.description}>
                                                        {tx.description}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                        {formatDate(tx.date)} · {tx.bankAccount?.bankName || 'Banco'}
                                                    </span>
                                                    {is1to1 && matchedDte && (
                                                         <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                                             ➔ Vinculado a Folio #{matchedDte.folio}
                                                         </span>
                                                     )}
                                                 </div>
                                             </div>

                                             <div className="font-extrabold text-slate-900 font-mono shrink-0 text-right text-xs">
                                                 {formatCurrency(tx.amount)}
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                         </div>

                         {/* Right Column: Pending DTEs List */}
                         <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                             <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                                 <span>Documentos / Facturas ({grp.pendingDtes.length})</span>
                                 <span className="font-mono text-slate-900">{formatCurrency(grp.pendingDteTotal)}</span>
                             </div>
                             {grp.pendingDtes.length === 0 ? (
                                 <div className="text-center text-slate-400 text-xs py-8 font-medium">
                                     No hay documentos tributarios impagos registrados para este RUT en el periodo.
                                 </div>
                             ) : (
                                 <div className="space-y-2 max-h-96 overflow-y-auto pr-1 divide-y divide-slate-100">
                                     {sortedDtes.map((dte: any, idx: number) => {
                                         const is1to1 = match1to1DteIds.has(dte.id);
                                         const matchedTx = dteToTxMap.get(dte.id);
                                         const isHovered = (hoveredTxId && matchedTx && matchedTx.id === hoveredTxId) || (hoveredTxId && txToDteMap.get(hoveredTxId)?.id === dte.id);

                                         return (
                                             <div
                                                 key={`${dte.id}-${idx}`}
                                                 onMouseEnter={() => matchedTx && setHoveredTxId(matchedTx.id)}
                                                 onMouseLeave={() => setHoveredTxId(null)}
                                                 onClick={() => onOpenModal(matchedTx ? [matchedTx] : [], [dte], grp.provider || { name: grp.groupName, rut: grp.rut })}
                                                 title="Haga clic para conciliar manualmente esta factura contra los movimientos bancarios del proveedor"
                                                 className={`pt-2.5 pb-2 px-2.5 text-xs flex justify-between items-center rounded-lg transition-all cursor-pointer ${
                                                     isHovered
                                                         ? 'bg-emerald-50 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-400/50'
                                                         : is1to1
                                                         ? 'bg-amber-50/50 border border-amber-200 hover:border-amber-400 shadow-2xs'
                                                         : 'bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                                                 }`}
                                             >
                                                 <div className="min-w-0 pr-2">
                                                     <div className="flex items-center gap-2 flex-wrap">
                                                         {is1to1 && (
                                                             <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-600 text-white px-2 py-0.5 rounded-full shadow-xs shrink-0">
                                                                 <CheckCircleSolid className="h-3 w-3 text-amber-200" />
                                                                 <span>Coincidencia 1:1</span>
                                                             </span>
                                                         )}
                                                         <span className="font-bold text-slate-900">
                                                             Folio: #{dte.folio}
                                                         </span>
                                                     </div>

                                                     <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                         <span className="text-[10px] text-slate-500 font-mono">
                                                             {formatDate(dte.issuedDate)} · {dte.provider?.name || 'Proveedor'}
                                                         </span>
                                                         {is1to1 && matchedTx && (
                                                             <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 shrink-0 inline-flex items-center gap-1 shadow-2xs">
                                                                 ➔ Vinculado a Movimiento Bancario
                                                             </span>
                                                         )}
                                                    </div>
                                                </div>

                                                <div className="font-extrabold text-slate-900 font-mono shrink-0 text-right text-xs">
                                                    {formatCurrency(dte.totalAmount)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
