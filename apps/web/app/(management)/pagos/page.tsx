'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import {
    MagnifyingGlassIcon,
    BanknotesIcon,
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    CheckCircleIcon,
    ClockIcon,
    PencilSquareIcon,
    ChatBubbleLeftIcon,
    CreditCardIcon,
    DocumentTextIcon,
    XMarkIcon,
    ArrowDownTrayIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    FunnelIcon,
    LinkIcon,
    ExclamationTriangleIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '../../../lib/api';

const API = getApiUrl();

interface BankTransaction {
    id: string;
    date: string;
    amount: number;
    description: string;
    reference: string | null;
    type: 'CREDIT' | 'DEBIT';
    status: string;
    metadata: any;
    bankAccount: { bankName: string; accountNumber: string };
    hasMatch: boolean;
    matchCount: number;
    matches: MatchInfo[];
}

interface MatchInfo {
    id: string;
    confidence: number;
    ruleApplied: string;
    status: string;
    origin: string;
    dte?: {
        folio: number;
        type: number;
        totalAmount: number;
        issuedDate: string;
        provider?: { name: string; rut: string } | null;
    } | null;
    payment?: {
        amount: number;
        paymentDate: string;
        provider?: { name: string } | null;
    } | null;
}

interface Summary {
    total: number;
    totalDebits: number;
    totalCredits: number;
    netFlow: number;
    matched: number;
    unmatched: number;
    matchRate: number;
    annotated: number;
    annotatedRate: number;
    covered: number;
    coverageRate: number;
    withoutAnything: number;
}

type AnnotationFilter = 'ALL' | 'ANNOTATED' | 'NOT_ANNOTATED';

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

const formatDateShort = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });

const dteTypeName = (type: number) => {
    const map: Record<number, string> = { 33: 'Factura', 34: 'Fact. Exenta', 61: 'N. Crédito', 56: 'N. Débito' };
    return map[type] || `T${type}`;
};

const ruleLabel = (rule: string) => {
    if (!rule) return '';
    if (rule.includes('ExactMatch')) return 'Exacto';
    if (rule.includes('AmountMatch')) return 'Monto';
    if (rule.includes('SumMatch')) return 'Suma';
    if (rule.includes('SplitPayment')) return 'Split';
    return rule.split('.').pop() || rule;
};

export default function LibroResumenPage() {
    const [exporting, setExporting] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>('ALL');
    const [dateRange, setDateRange] = useState({
        from: '2025-01-01',
        to: new Date().toISOString().split('T')[0],
    });

    const txParams = new URLSearchParams({ fromDate: dateRange.from, toDate: dateRange.to, limit: '2000' }).toString();
    const { data: txData, isLoading: txLoading, error: txError, mutate: mutateTx } = useSWR(`${API}/transactions?${txParams}`);
    const { data: summary } = useSWR<Summary>(`${API}/transactions/summary?${txParams}`);

    const transactions: BankTransaction[] = txData ? (Array.isArray(txData) ? txData : txData.data || []) : [];
    const loading = txLoading;
    const error = txError?.message || null;

    const filteredTransactions = transactions.filter((tx) => {
        const meta = (tx.metadata as any) || {};
        const matchesSearch = !search || (() => {
            const q = search.toLowerCase();
            return tx.description.toLowerCase().includes(q) ||
                tx.reference?.toLowerCase().includes(q) ||
                meta.empresaExcel?.toLowerCase()?.includes(q) ||
                meta.comentarioExcel?.toLowerCase()?.includes(q) ||
                meta.detalleExcel?.toLowerCase()?.includes(q) ||
                meta.folioExcel?.toLowerCase()?.includes(q) ||
                tx.matches?.some((m: MatchInfo) => m.dte?.provider?.name?.toLowerCase().includes(q));
        })();
        const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
        const matchesStatus = statusFilter === 'ALL' || tx.status === statusFilter;

        let matchesAnnotation = true;
        if (annotationFilter === 'ANNOTATED') {
            matchesAnnotation = !!(meta.empresaExcel || meta.comentarioExcel || meta.detalleExcel);
        } else if (annotationFilter === 'NOT_ANNOTATED') {
            matchesAnnotation = !(meta.empresaExcel || meta.comentarioExcel || meta.detalleExcel);
        }

        return matchesSearch && matchesType && matchesStatus && matchesAnnotation;
    });

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams({
                fromDate: dateRange.from,
                toDate: dateRange.to,
                type: 'TRANSACTIONS',
            });
            const res = await fetch(`${API}/conciliacion/export?${params}`);
            if (!res.ok) throw new Error('Error al exportar');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `libro_pagos_${dateRange.from}_${dateRange.to}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Error al exportar: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 font-medium">Cargando libro de pagos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Libro de Pagos</h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Resumen completo de movimientos bancarios, conciliaciones y anotaciones
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {exporting ? 'Exportando...' : 'Exportar Excel'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => mutateTx()} className="text-red-600 font-medium hover:text-red-800">Reintentar</button>
                </div>
            )}

            {/* KPI Cards */}
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <KpiCard
                        icon={<BanknotesIcon className="h-5 w-5" />}
                        iconBg="bg-slate-100 text-slate-600"
                        value={summary.total.toString()}
                        label="Movimientos"
                    />
                    <KpiCard
                        icon={<ArrowTrendingDownIcon className="h-5 w-5" />}
                        iconBg="bg-red-50 text-red-500"
                        value={formatCurrency(summary.totalDebits)}
                        label="Egresos"
                    />
                    <KpiCard
                        icon={<CheckCircleIcon className="h-5 w-5" />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        value={`${summary.matchRate.toFixed(1)}%`}
                        label={`Conciliado (${summary.matched})`}
                    />
                    <KpiCard
                        icon={<ChatBubbleLeftIcon className="h-5 w-5" />}
                        iconBg="bg-blue-50 text-blue-600"
                        value={`${(summary.annotatedRate ?? 0).toFixed(1)}%`}
                        label={`Con anotación (${summary.annotated ?? 0})`}
                    />
                    <KpiCard
                        icon={<ShieldCheckIcon className="h-5 w-5" />}
                        iconBg="bg-indigo-50 text-indigo-600"
                        value={`${(summary.coverageRate ?? summary.matchRate ?? 0).toFixed(1)}%`}
                        label={`Cobertura total (${summary.covered ?? summary.matched ?? 0})`}
                        highlight
                    />
                </div>
            )}

            {/* Coverage Bar */}
            {summary && summary.total > 0 && (() => {
                const covered = summary.covered ?? summary.matched;
                const pctMatched = (summary.matched / summary.total) * 100;
                const onlyAnnotated = Math.max(0, covered - summary.matched);
                const pctOnlyAnnotated = (onlyAnnotated / summary.total) * 100;
                const withoutAnything = summary.withoutAnything ?? (summary.total - covered);
                return (
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Cobertura del período</span>
                            <span className="text-xs text-slate-400">
                                {withoutAnything} movimientos sin clasificar
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                            <div className="h-full flex">
                                <div
                                    className="bg-emerald-500 transition-all duration-500"
                                    style={{ width: `${pctMatched}%` }}
                                    title={`Conciliados: ${summary.matched}`}
                                />
                                <div
                                    className="bg-blue-400 transition-all duration-500"
                                    style={{ width: `${pctOnlyAnnotated}%` }}
                                    title={`Solo anotados: ${onlyAnnotated}`}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Conciliado ({summary.matched})</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" />Solo anotado ({onlyAnnotated})</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200" />Sin clasificar ({withoutAnything})</span>
                        </div>
                    </div>
                );
            })()}

            {/* Filters Bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
                    <div className="flex items-center gap-2 shrink-0">
                        <FunnelIcon className="h-4 w-4 text-slate-400" />
                        <input type="date" value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        <span className="text-slate-400 text-sm">—</span>
                        <input type="date" value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div className="relative flex-1 min-w-0">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Buscar: descripción, empresa, comentario, proveedor, folio..."
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="border border-slate-300 rounded-lg pl-10 pr-3 py-2 text-sm w-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="ALL">Tipo: Todos</option>
                            <option value="CREDIT">Ingresos</option>
                            <option value="DEBIT">Egresos</option>
                        </select>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="ALL">Estado: Todos</option>
                            <option value="PENDING">Pendientes</option>
                            <option value="MATCHED">Conciliadas</option>
                        </select>
                        <select value={annotationFilter} onChange={(e) => setAnnotationFilter(e.target.value as AnnotationFilter)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                            <option value="ALL">Notas: Todas</option>
                            <option value="ANNOTATED">Con anotación</option>
                            <option value="NOT_ANNOTATED">Sin anotación</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>Mostrando {filteredTransactions.length} de {transactions.length} movimientos</span>
                <span className="text-slate-300">
                    {typeFilter !== 'ALL' || statusFilter !== 'ALL' || annotationFilter !== 'ALL' || search ? 'Filtros activos' : ''}
                </span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-tight text-[11px]">
                            <tr>
                                <th className="px-3 py-3 w-8"></th>
                                <th className="px-3 py-3">Fecha</th>
                                <th className="px-3 py-3">Descripción</th>
                                <th className="px-3 py-3">Empresa / Nota</th>
                                <th className="px-3 py-3 text-right">Monto</th>
                                <th className="px-3 py-3 text-center">Estado</th>
                                <th className="px-3 py-3 text-center">Info</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredTransactions.map((tx) => (
                                <TransactionRow key={tx.id} tx={tx} onUpdated={() => mutateTx()} />
                            ))}
                        </tbody>
                    </table>
                </div>
                {filteredTransactions.length === 0 && (
                    <div className="text-center py-16">
                        <BanknotesIcon className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 font-medium">No se encontraron movimientos</p>
                        <p className="text-slate-300 text-xs mt-1">Ajusta los filtros o el rango de fechas</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiCard({ icon, iconBg, value, label, highlight }: {
    icon: React.ReactNode; iconBg: string; value: string; label: string; highlight?: boolean;
}) {
    return (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
            <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
            <div className="min-w-0">
                <div className={`text-xl font-bold truncate ${highlight ? 'text-indigo-700' : 'text-slate-900'}`}>{value}</div>
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider truncate">{label}</div>
            </div>
        </div>
    );
}

function TransactionRow({ tx, onUpdated }: { tx: BankTransaction; onUpdated: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [formData, setFormData] = useState({ empresa: '', detalle: '', comentario: '', folio: '' });
    const [saving, setSaving] = useState(false);

    const meta = (tx.metadata as any) || {};
    const hasAnnotation = !!(meta.empresaExcel || meta.detalleExcel || meta.comentarioExcel);
    const hasMatch = tx.hasMatch && tx.matches?.length > 0;
    const empresa = meta.empresaExcel || '';
    const comentario = meta.comentarioExcel || '';
    const detalle = meta.detalleExcel || '';
    const medioPago = meta.medioPago || '';
    const folio = meta.folioExcel || '';

    const displayNote = [empresa, detalle, comentario].filter(Boolean).join(' — ');

    const handleEdit = () => {
        setFormData({
            empresa: meta.empresaExcel || '',
            detalle: meta.detalleExcel || '',
            comentario: meta.comentarioExcel || '',
            folio: meta.folioExcel || '',
        });
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`${API}/transactions/${tx.id}/annotate`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            setEditing(false);
            onUpdated();
        } finally { setSaving(false); }
    };

    const statusBadge = tx.status === 'MATCHED' ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-bold">
            <CheckCircleIcon className="h-3.5 w-3.5" />CONCILIADO
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-bold">
            <ClockIcon className="h-3 w-3" />PENDIENTE
        </span>
    );

    const infoBadges = (
        <div className="flex items-center gap-1 justify-center">
            {hasMatch && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100" title="Tiene match de conciliación">
                    <LinkIcon className="h-2.5 w-2.5 mr-0.5" />{tx.matchCount}
                </span>
            )}
            {hasAnnotation && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-100" title="Tiene anotación">
                    <ChatBubbleLeftIcon className="h-2.5 w-2.5" />
                </span>
            )}
            {medioPago && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-50 text-slate-500 border border-slate-100" title={medioPago}>
                    <CreditCardIcon className="h-2.5 w-2.5" />
                </span>
            )}
            {!hasMatch && !hasAnnotation && (
                <span className="text-slate-200 text-[10px]">—</span>
            )}
        </div>
    );

    return (
        <>
            <tr
                className={`transition-colors duration-100 cursor-pointer ${expanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50/70'} group`}
                onClick={() => setExpanded(!expanded)}
            >
                <td className="px-3 py-2.5 text-center">
                    {expanded
                        ? <ChevronUpIcon className="h-4 w-4 text-indigo-500" />
                        : <ChevronDownIcon className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />}
                </td>
                <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap text-xs">
                    {formatDate(tx.date)}
                </td>
                <td className="px-3 py-2.5 max-w-[250px]">
                    <div className="font-semibold text-slate-900 text-[13px] truncate" title={tx.description}>{tx.description}</div>
                    {tx.reference && <div className="text-[10px] text-slate-400 font-mono truncate">Ref: {tx.reference}</div>}
                </td>
                <td className="px-3 py-2.5 max-w-[280px]">
                    {displayNote ? (
                        <div className="text-xs text-slate-600 truncate" title={displayNote}>{displayNote}</div>
                    ) : hasMatch && tx.matches[0]?.dte?.provider?.name ? (
                        <div className="text-xs text-indigo-500 truncate italic">{tx.matches[0].dte.provider.name}</div>
                    ) : (
                        <span className="text-[10px] text-slate-200">Sin anotación</span>
                    )}
                </td>
                <td className={`px-3 py-2.5 text-right font-bold text-[15px] tabular-nums ${tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {tx.type === 'DEBIT' ? '-' : '+'}{formatCurrency(Math.abs(tx.amount))}
                </td>
                <td className="px-3 py-2.5 text-center">{statusBadge}</td>
                <td className="px-3 py-2.5 text-center">{infoBadges}</td>
            </tr>

            {/* Expanded Detail */}
                            {expanded && (
                                <tr>
                                    <td colSpan={7} className="bg-slate-50/80 border-b border-slate-200">
                                        <div className="px-6 py-4 space-y-4">
                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                {/* Anotación */}
                                                <div className="bg-white rounded-lg border border-slate-200 p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                                                            <ChatBubbleLeftIcon className="h-3.5 w-3.5 text-blue-500" />
                                                            Anotación / Comentario
                                                        </h4>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5">
                                            <PencilSquareIcon className="h-3 w-3" />Editar
                                        </button>
                                    </div>
                                    {editing ? (
                                        <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                            <div>
                                                <label className="text-[10px] text-slate-500 font-semibold uppercase">Empresa / Item</label>
                                                <input value={formData.empresa}
                                                    onChange={e => setFormData(p => ({ ...p, empresa: e.target.value }))}
                                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs mt-0.5 focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="Ej: Arriendo, Entel, SASCO..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 font-semibold uppercase">Detalle</label>
                                                <input value={formData.detalle}
                                                    onChange={e => setFormData(p => ({ ...p, detalle: e.target.value }))}
                                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs mt-0.5 focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="Ej: Arriendo oficina Monjitas, Cuota 2 de 6..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 font-semibold uppercase">Comentario</label>
                                                <textarea value={formData.comentario}
                                                    onChange={e => setFormData(p => ({ ...p, comentario: e.target.value }))}
                                                    rows={2}
                                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs mt-0.5 focus:ring-1 focus:ring-indigo-500 resize-none"
                                                    placeholder="Observaciones adicionales..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 font-semibold uppercase">Folio Factura</label>
                                                <input value={formData.folio}
                                                    onChange={e => setFormData(p => ({ ...p, folio: e.target.value }))}
                                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs mt-0.5 focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="Ej: 34914" />
                                            </div>
                                            <div className="flex items-center gap-2 pt-1">
                                                <button onClick={handleSave} disabled={saving}
                                                    className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50">
                                                    {saving ? 'Guardando...' : 'Guardar'}
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                                                    className="text-slate-500 hover:text-slate-700 text-xs font-medium">Cancelar</button>
                                            </div>
                                        </div>
                                    ) : hasAnnotation ? (
                                        <div className="space-y-1.5 text-xs">
                                            {empresa && <div><span className="text-slate-400 font-medium">Empresa:</span> <span className="text-slate-700 font-semibold">{empresa}</span></div>}
                                            {detalle && <div><span className="text-slate-400 font-medium">Detalle:</span> <span className="text-slate-700">{detalle}</span></div>}
                                            {comentario && <div><span className="text-slate-400 font-medium">Comentario:</span> <span className="text-slate-700">{comentario}</span></div>}
                                            {folio && <div><span className="text-slate-400 font-medium">Folio:</span> <span className="text-indigo-600 font-mono">{folio}</span></div>}
                                            {medioPago && <div><span className="text-slate-400 font-medium">Medio:</span> <span className="text-slate-600">{medioPago}</span></div>}
                                            {meta.excelSource && <div className="text-[10px] text-slate-300 mt-2 italic">Fuente: {meta.excelSource}</div>}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-300 italic">Sin anotación. Haz clic en Editar para agregar.</p>
                                    )}
                                </div>

                                {/* Match / Conciliación */}
                                <div className="bg-white rounded-lg border border-slate-200 p-4">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1 mb-3">
                                        <LinkIcon className="h-3.5 w-3.5 text-emerald-500" />
                                        Conciliación
                                    </h4>
                                    {hasMatch ? (
                                        <div className="space-y-2">
                                            {tx.matches.map((m, i) => (
                                                <div key={m.id || i} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-bold text-emerald-600 uppercase">{m.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador'}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {ruleLabel(m.ruleApplied)} · {(m.confidence * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    {m.dte && (
                                                        <div className="text-xs space-y-0.5">
                                                            <div className="font-semibold text-slate-800">
                                                                {dteTypeName(m.dte.type)} #{m.dte.folio}
                                                            </div>
                                                            {m.dte.provider && (
                                                                <div className="text-slate-600">{m.dte.provider.name}</div>
                                                            )}
                                                            <div className="flex justify-between text-slate-500">
                                                                <span>{formatDateShort(m.dte.issuedDate)}</span>
                                                                <span className="font-bold text-slate-700">{formatCurrency(m.dte.totalAmount)}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {m.payment && (
                                                        <div className="text-xs space-y-0.5">
                                                            <div className="font-semibold text-slate-800">Pago registrado</div>
                                                            {m.payment.provider && <div className="text-slate-600">{m.payment.provider.name}</div>}
                                                            <div className="flex justify-between text-slate-500">
                                                                <span>{formatDateShort(m.payment.paymentDate)}</span>
                                                                <span className="font-bold text-slate-700">{formatCurrency(m.payment.amount)}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-4">
                                            <ExclamationTriangleIcon className="h-8 w-8 text-slate-200 mx-auto mb-1" />
                                            <p className="text-xs text-slate-300 italic">Sin conciliación</p>
                                        </div>
                                    )}
                                </div>

                                {/* Detalles Técnicos */}
                                <div className="bg-white rounded-lg border border-slate-200 p-4">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1 mb-3">
                                        <DocumentTextIcon className="h-3.5 w-3.5 text-slate-400" />
                                        Detalle Transacción
                                    </h4>
                                    <div className="space-y-1.5 text-xs">
                                        <DetailRow label="ID" value={tx.id.slice(0, 12) + '...'} mono />
                                        <DetailRow label="Banco" value={tx.bankAccount?.bankName || 'N/A'} />
                                        <DetailRow label="Cuenta" value={tx.bankAccount?.accountNumber || 'N/A'} />
                                        <DetailRow label="Tipo" value={tx.type === 'DEBIT' ? 'Cargo (Egreso)' : 'Abono (Ingreso)'} />
                                        <DetailRow label="Referencia" value={tx.reference || '—'} mono />
                                        <DetailRow label="Estado" value={tx.status} />
                                        <DetailRow label="Monto" value={formatCurrency(tx.amount)} bold />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

function DetailRow({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">{label}</span>
            <span className={`text-slate-700 ${mono ? 'font-mono text-[10px]' : ''} ${bold ? 'font-bold' : ''}`}>{value}</span>
        </div>
    );
}
