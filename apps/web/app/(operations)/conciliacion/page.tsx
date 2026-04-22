'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ArrowPathIcon, CheckCircleIcon, XCircleIcon, CurrencyDollarIcon,
    DocumentTextIcon, LinkIcon, ClockIcon, SparklesIcon, UsersIcon,
    TrashIcon, ChatBubbleLeftIcon, HandThumbUpIcon, HandThumbDownIcon,
    PencilSquareIcon, ChevronDownIcon, ChevronUpIcon, PlusCircleIcon,
    MagnifyingGlassIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '@/lib/api';

const API = getApiUrl();

interface DashboardData {
    period: { from: string; to: string };
    summary: {
        transactions: { total: number; matched: number; pending: number; match_rate: string; total_amount: number };
        dtes: { total: number; paid: number; unpaid: number; partially_paid: number; payment_rate: string; total_amount: number; outstanding_amount: number };
        matches: { total: number; confirmed: number; draft: number; automatic: number; manual: number; auto_rate: string };
    };
    pending: { transactions: any[]; dtes: any[] };
    recent_matches: any[];
    insights: { top_providers: any[]; high_value_unmatched: { transactions: any[]; dtes: any[] } };
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ConciliacionPage() {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [matchProgress, setMatchProgress] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'matches' | 'suggestions' | 'manual'>('matches');
    const [dateRange, setDateRange] = useState(() => {
        const today = new Date().toISOString().split('T')[0];
        return { from: '2026-01-01', to: today };
    });

    const fetchDashboard = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError(null);
        try {
            const { authFetch } = await import('@/lib/auth');
            const params = new URLSearchParams({ fromDate: dateRange.from, toDate: dateRange.to });
            const response = await authFetch(`${API}/conciliacion/dashboard?${params}`);
            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
            setDashboardData(await response.json());
            setLastUpdated(new Date().toLocaleTimeString('es-CL'));
        } catch (err: any) {
            setError(err.message || 'Error al cargar el dashboard');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [dateRange.from, dateRange.to]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const runAutoMatch = async () => {
        setIsRefreshing(true);
        setMatchProgress('Iniciando motor de conciliación...');
        try {
            const { authFetch } = await import('@/lib/auth');
            const response = await authFetch(`${API}/conciliacion/run-auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromDate: dateRange.from, toDate: dateRange.to, syncFromSources: true }),
            });
            if (!response.ok) throw new Error('Error al ejecutar auto-match');
            setMatchProgress('Procesando transacciones...');
            await fetchDashboard(true);

            let count = 0;
            const interval = setInterval(async () => {
                count++;
                setMatchProgress(`Actualizando resultados (${count}/6)...`);
                await fetchDashboard(true);
                if (count >= 6) {
                    clearInterval(interval);
                    setMatchProgress(null);
                }
            }, 10000);
        } catch (err: any) {
            setMatchProgress(null);
            setError(err.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <ArrowPathIcon className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    if (error && !dashboardData) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <div className="flex items-center space-x-3">
                    <XCircleIcon className="h-8 w-8 text-red-500" />
                    <div>
                        <h3 className="font-semibold text-red-800">Error al cargar el dashboard</h3>
                        <p className="text-red-600 text-sm mt-1">{error}</p>
                        <button onClick={() => fetchDashboard()} className="mt-3 text-sm text-red-700 hover:text-red-800 font-medium">Reintentar</button>
                    </div>
                </div>
            </div>
        );
    }

    if (!dashboardData) return null;

    return (
        <div className="space-y-6">
            {/* Header con filtros de fecha */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <div className="flex items-center space-x-3">
                        <h1 className="text-2xl font-bold text-slate-800">Conciliación Bancaria</h1>
                        <span className="text-sm font-normal text-slate-500">(KPIs y reportes)</span>
                        {(isRefreshing || matchProgress) && (
                            <div className="flex items-center space-x-2 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                <ArrowPathIcon className="h-4 w-4 text-indigo-500 animate-spin" />
                                <span className="text-[10px] font-bold text-indigo-600 uppercase">
                                    {matchProgress || 'Sincronizando...'}
                                </span>
                            </div>
                        )}
                    </div>
                    {lastUpdated && (
                        <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded italic mt-1 inline-block">
                            Ult. act: {lastUpdated}
                        </span>
                    )}
                </div>
                <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                        <label className="text-xs text-slate-500 font-medium">Desde</label>
                        <input type="date" value={dateRange.from}
                            onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-slate-700 font-medium" />
                    </div>
                    <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                        <label className="text-xs text-slate-500 font-medium">Hasta</label>
                        <input type="date" value={dateRange.to}
                            onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-slate-700 font-medium" />
                    </div>
                    <a href="/cartolas"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all">
                        <SparklesIcon className="h-5 w-5" />
                        <span>Conciliar en Cartolas</span>
                    </a>
                </div>
            </div>

            {/* Aviso: acciones en Cartolas */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-slate-600">
                    <strong>KPIs y reportes.</strong> Ejecutar motor, aprobar matches y crear matches manuales se hace en <strong>Cartolas Bancarias</strong>. Los datos se comparten con Facturas y Proveedores.
                </p>
                <a href="/cartolas" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
                    Ir a Cartolas Bancarias →
                </a>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<CurrencyDollarIcon className="h-6 w-6 text-slate-600" />}
                    badge={`${dashboardData.summary.transactions.match_rate} MATCH`}
                    value={dashboardData.summary.transactions.total}
                    label="Transacciones Bancarias"
                    details={[
                        { label: 'Conciliadas', value: dashboardData.summary.transactions.matched, color: 'text-emerald-600' },
                        { label: 'Pendientes', value: dashboardData.summary.transactions.pending, color: 'text-amber-500' },
                    ]}
                />
                <StatCard
                    icon={<DocumentTextIcon className="h-6 w-6 text-slate-600" />}
                    badge={`${dashboardData.summary.dtes.payment_rate} PAGO`}
                    value={dashboardData.summary.dtes.total}
                    label="DTEs (Facturas)"
                    details={[
                        { label: 'Pagadas', value: dashboardData.summary.dtes.paid, color: 'text-emerald-600' },
                        { label: 'Pendientes', value: dashboardData.summary.dtes.unpaid, color: 'text-amber-500' },
                    ]}
                />
                <StatCard
                    icon={<LinkIcon className="h-6 w-6 text-slate-600" />}
                    badge={`${dashboardData.summary.matches.auto_rate} AUTO`}
                    value={dashboardData.summary.matches.total}
                    label="Matches Totales"
                    details={[
                        { label: 'Auto', value: dashboardData.summary.matches.automatic, color: 'text-indigo-600' },
                        { label: 'Manual', value: dashboardData.summary.matches.manual, color: 'text-slate-600' },
                    ]}
                />
                <div className="card-glass p-6">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><CurrencyDollarIcon className="h-6 w-6" /></div>
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-100">PENDIENTE</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mb-1">{formatCurrency(dashboardData.summary.dtes.outstanding_amount)}</div>
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-tight">Monto por Pagar</div>
                    <div className="mt-4 text-[11px] font-medium text-slate-400 italic">De {formatCurrency(dashboardData.summary.dtes.total_amount)} registrados</div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200">
                <nav className="flex space-x-1">
                    {[
                        { key: 'matches' as const, label: 'Matches Recientes', count: dashboardData.recent_matches.length },
                        { key: 'suggestions' as const, label: 'Sugerencias Pendientes', count: null },
                        { key: 'manual' as const, label: 'Match Manual', count: null },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? 'border-indigo-600 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}>
                            {tab.label}
                            {tab.count != null && tab.count > 0 && (
                                <span className="ml-2 bg-slate-200 text-slate-700 text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'matches' && dashboardData.recent_matches.length > 0 && (
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-100">
                        {dashboardData.recent_matches.map((match: any) => (
                            <MatchCardReadOnly key={match.id} match={match} />
                        ))}
                    </div>
                </div>
            )}
            {activeTab === 'matches' && dashboardData.recent_matches.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                    <LinkIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin matches recientes</p>
                    <p className="text-sm mt-1">Ejecuta la conciliación en Cartolas Bancarias para generar matches</p>
                    <a href="/cartolas" className="inline-block mt-3 text-indigo-600 font-medium text-sm hover:underline">Ir a Cartolas →</a>
                </div>
            )}

            {activeTab === 'suggestions' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <SparklesIcon className="h-12 w-12 mx-auto mb-3 text-amber-500" />
                    <p className="font-medium text-slate-800">Sugerencias de match</p>
                    <p className="text-sm text-slate-600 mt-1">Revisa y aprueba las sugerencias en Cartolas Bancarias</p>
                    <a href="/cartolas" className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Ir a Cartolas Bancarias</a>
                </div>
            )}

            {activeTab === 'manual' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                    <LinkIcon className="h-12 w-12 mx-auto mb-3 text-slate-400" />
                    <p className="font-medium text-slate-800">Match manual</p>
                    <p className="text-sm text-slate-600 mt-1">Crea matches manuales desde Cartolas Bancarias</p>
                    <a href="/cartolas" className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Ir a Cartolas Bancarias</a>
                </div>
            )}

            {/* Top Providers */}
            {dashboardData.insights.top_providers.length > 0 && (
                <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-semibold text-slate-700">Top Proveedores por Deuda Pendiente</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {dashboardData.insights.top_providers.map((prov: any, idx: number) => (
                                <div key={prov.provider.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                                        <div>
                                            <div className="font-medium text-slate-900">{prov.provider.name}</div>
                                            <div className="text-xs text-slate-500">RUT: {prov.provider.rut} &bull; {prov.dte_count} DTEs</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-red-600">{formatCurrency(prov.total_outstanding)}</div>
                                        <div className="text-xs text-slate-500">de {formatCurrency(prov.total_amount)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ icon, badge, value, label, details }: {
    icon: React.ReactNode; badge: string; value: number; label: string;
    details: { label: string; value: number; color: string }[];
}) {
    return (
        <div className="card-glass p-6">
            <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-slate-100 rounded-lg">{icon}</div>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">{badge}</span>
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
            <div className="text-xs text-slate-500 font-medium uppercase tracking-tight">{label}</div>
            <div className="mt-4 flex items-center space-x-3 text-[11px] font-semibold">
                {details.map(d => (
                    <div key={d.label} className={`flex items-center ${d.color}`}>
                        <CheckCircleIcon className="h-3 w-3 mr-1" />{d.value}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Suggestions Section ──

function SuggestionsSection({ onRefresh }: { onRefresh: () => void }) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [rejectModal, setRejectModal] = useState<{ id: string; open: boolean }>({ id: '', open: false });
    const [rejectReason, setRejectReason] = useState('');

    const load = useCallback(async () => {
        try {
            const { authFetch } = await import('@/lib/auth');
            const res = await authFetch(`${API}/conciliacion/suggestions?status=PENDING`);
            if (res.ok) setSuggestions(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleAccept = async (id: string) => {
        setBusy(id);
        try {
            const { authFetch } = await import('@/lib/auth');
            const res = await authFetch(`${API}/conciliacion/suggestions/${id}/accept`, { method: 'POST' });
            if (res.ok) { await load(); onRefresh(); }
        } finally { setBusy(null); }
    };

    const openRejectModal = (id: string) => {
        setRejectModal({ id, open: true });
        setRejectReason('');
    };

    const handleReject = async () => {
        const id = rejectModal.id;
        setRejectModal({ id: '', open: false });
        setBusy(id);
        try {
            const { authFetch } = await import('@/lib/auth');
            const res = await authFetch(`${API}/conciliacion/suggestions/${id}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: rejectReason || 'Rechazada por usuario' }),
            });
            if (res.ok) await load();
        } finally { setBusy(null); }
    };

    if (loading) return <div className="text-center py-8"><ArrowPathIcon className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>;

    if (suggestions.length === 0) {
        return (
            <div className="text-center py-12 text-slate-400">
                <SparklesIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Sin sugerencias pendientes</p>
                <p className="text-sm mt-1">Las sugerencias se generan al ejecutar la conciliación automática</p>
            </div>
        );
    }

    return (
        <>
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 shadow-xl shadow-amber-200/30 rounded-xl border border-amber-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-amber-200/60 bg-amber-50/80">
                    <div className="flex items-center space-x-2">
                        <SparklesIcon className="h-5 w-5 text-amber-600" />
                        <h3 className="font-semibold text-amber-800">Sugerencias de Match</h3>
                        <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{suggestions.length}</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">Revisa y aprueba o rechaza cada sugerencia del motor de conciliación</p>
                </div>
                <div className="divide-y divide-amber-100">
                    {suggestions.map((s: any) => (
                        <SuggestionCard key={s.id} suggestion={s} busy={busy === s.id}
                            onAccept={() => handleAccept(s.id)} onReject={() => openRejectModal(s.id)} />
                    ))}
                </div>
            </div>

            {/* Reject Modal */}
            {rejectModal.open && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRejectModal({ id: '', open: false })}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-slate-800 mb-3">Rechazar Sugerencia</h3>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            placeholder="Motivo del rechazo (opcional)..." rows={3}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-4" />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setRejectModal({ id: '', open: false })}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancelar</button>
                            <button onClick={handleReject}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Rechazar</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function SuggestionCard({ suggestion: s, busy, onAccept, onReject }: {
    suggestion: any; busy: boolean; onAccept: () => void; onReject: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const transactions = (s.transactions || []) as any[];
    const relatedDtes = (s.relatedDtes || []) as any[];
    const isSplit = s.type === 'SPLIT';
    const txCount = transactions.length;
    const dteCount = isSplit ? relatedDtes.length : 1;

    const txTotal = transactions.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
    const dteTotal = isSplit
        ? relatedDtes.reduce((sum: number, d: any) => sum + Math.abs(d.totalAmount), 0)
        : Math.abs(s.dte?.totalAmount || 0);
    const diff = Math.abs(txTotal - dteTotal);

    const label = isSplit
        ? `1 movimiento \u2192 ${dteCount} facturas`
        : `${txCount} movimiento${txCount !== 1 ? 's' : ''} \u2192 1 factura`;

    return (
        <div className="px-6 py-4 hover:bg-amber-50/50 transition-colors">
            <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSplit ? 'text-violet-700 bg-violet-100' : 'text-blue-700 bg-blue-100'}`}>
                            {isSplit ? 'SPLIT' : 'SUM'}
                        </span>
                        <span className="text-xs font-bold text-amber-700 bg-amber-200/80 px-2 py-0.5 rounded">{label}</span>
                        <span className="text-xs text-slate-500">Confianza: {(s.confidence * 100).toFixed(0)}%</span>
                        {expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                    </div>
                    <div className="text-sm">
                        <span className="font-medium text-slate-900">{s.dte?.provider?.name || 'Sin proveedor'}</span>
                        <span className="text-slate-400 mx-2">&bull;</span>
                        <span className="text-slate-600">Movimientos: {formatCurrency(txTotal || s.totalAmount)}</span>
                        <span className="text-slate-400 mx-2">&asymp;</span>
                        <span className="text-slate-600">Facturas: {formatCurrency(dteTotal)}</span>
                        {diff > 0 && <span className="text-amber-600 ml-2 text-xs font-medium">(dif: {formatCurrency(diff)})</span>}
                    </div>
                    {!expanded && <p className="text-xs text-slate-400 italic">Clic para ver detalle</p>}
                </div>
                <div className="flex items-center space-x-2 shrink-0 ml-4">
                    <button onClick={onAccept} disabled={busy}
                        className="flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                        <HandThumbUpIcon className="h-4 w-4 mr-1" /> Aceptar
                    </button>
                    <button onClick={onReject} disabled={busy}
                        className="flex items-center px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 disabled:opacity-50">
                        <HandThumbDownIcon className="h-4 w-4 mr-1" /> Rechazar
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="mt-4 space-y-4 border-t border-amber-200/60 pt-4">
                    <div>
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center">
                            <CurrencyDollarIcon className="h-4 w-4 mr-1 text-slate-500" />
                            Movimientos Bancarios ({transactions.length})
                        </h4>
                        {transactions.length > 0 ? (
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                                            <th className="px-3 py-2 text-left font-semibold">Descripcion</th>
                                            <th className="px-3 py-2 text-right font-semibold">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {transactions.map((tx: any) => (
                                            <tr key={tx.id} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(tx.date)}</td>
                                                <td className="px-3 py-2 text-slate-900 font-medium">{tx.description}</td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(Math.abs(tx.amount))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {transactions.length > 1 && (
                                        <tfoot className="bg-amber-50">
                                            <tr>
                                                <td colSpan={2} className="px-3 py-2 text-right font-bold text-amber-800 text-xs uppercase">Total</td>
                                                <td className="px-3 py-2 text-right font-bold text-amber-800">{formatCurrency(txTotal)}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Datos de transacciones no disponibles</p>
                        )}
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center">
                            <DocumentTextIcon className="h-4 w-4 mr-1 text-slate-500" />
                            Facturas ({isSplit ? relatedDtes.length : 1})
                        </h4>
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Folio</th>
                                        <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                                        <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                                        <th className="px-3 py-2 text-right font-semibold">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isSplit ? relatedDtes.map((d: any) => (
                                        <tr key={d.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 text-indigo-700 font-bold">{d.folio}</td>
                                            <td className="px-3 py-2 text-slate-900">{d.provider?.name || '\u2014'}</td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(d.issuedDate)}</td>
                                            <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(Math.abs(d.totalAmount))}</td>
                                        </tr>
                                    )) : (
                                        <tr className="hover:bg-slate-50">
                                            <td className="px-3 py-2 text-indigo-700 font-bold">{s.dte?.folio}</td>
                                            <td className="px-3 py-2 text-slate-900">{s.dte?.provider?.name || '\u2014'}</td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{s.dte?.issuedDate ? formatDate(s.dte.issuedDate) : '\u2014'}</td>
                                            <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(Math.abs(s.dte?.totalAmount || 0))}</td>
                                        </tr>
                                    )}
                                </tbody>
                                {isSplit && relatedDtes.length > 1 && (
                                    <tfoot className="bg-indigo-50">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right font-bold text-indigo-800 text-xs uppercase">Total Facturas</td>
                                            <td className="px-3 py-2 text-right font-bold text-indigo-800">
                                                {formatCurrency(relatedDtes.reduce((sum: number, d: any) => sum + Math.abs(d.totalAmount), 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <div className={`flex items-center justify-between rounded-lg px-4 py-2 border ${diff === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <span className="text-xs font-semibold text-slate-600">Diferencia (movimientos vs facturas)</span>
                        <span className={`text-sm font-bold ${diff === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatCurrency(diff)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Match Card (solo lectura en este módulo; gestionar en Cartolas) ──

function MatchCardReadOnly({ match }: { match: any }) {
    const statusBadge = match.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700'
        : match.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
    const statusLabel = match.status === 'CONFIRMED' ? 'Confirmado'
        : match.status === 'REJECTED' ? 'Rechazado' : 'Borrador';
    const ruleClean = (match.ruleApplied || '').replace(/\s*-\s*.*$/, '');

    return (
        <div className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
                        <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge}`}>{statusLabel}</span>
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-bold border border-slate-200">
                            {match.origin === 'AUTOMATIC' ? 'AUTO' : 'MANUAL'}
                        </span>
                        {ruleClean && (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{ruleClean}</span>
                        )}
                        <span className="text-xs text-slate-500">{(match.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-xs text-slate-500 mb-1">Transacción</div>
                            <div className="font-medium text-slate-900">{match.transaction?.description}</div>
                            <div className="text-xs text-slate-600">{match.transaction && formatDate(match.transaction.date)} &bull; {match.transaction && formatCurrency(match.transaction.amount)}</div>
                        </div>
                        {match.dte && (
                            <div>
                                <div className="text-xs text-slate-500 mb-1">DTE</div>
                                <div className="font-medium text-slate-900">Folio {match.dte.folio} - {match.dte.provider?.name}</div>
                                <div className="text-xs text-slate-600">Tipo {match.dte.type} &bull; {formatCurrency(match.dte.totalAmount)}</div>
                            </div>
                        )}
                    </div>
                </div>
                <a href="/cartolas" className="shrink-0 ml-4 text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
                    Gestionar en Cartolas →
                </a>
            </div>
        </div>
    );
}

function MatchCard({ match, onRefresh }: { match: any; onRefresh: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState(match.notes || '');
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState<any[] | null>(null);

    const apiCall = async (url: string, opts: RequestInit) => {
        setBusy(true);
        try {
            const { authFetch } = await import('@/lib/auth');
            const res = await authFetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
            if (!res.ok) return null;
            return await res.json();
        } finally { setBusy(false); }
    };

    const [statusModal, setStatusModal] = useState<{ open: boolean; status: string }>({ open: false, status: '' });
    const [statusReason, setStatusReason] = useState('');

    const openStatusModal = (status: string) => {
        setStatusModal({ open: true, status });
        setStatusReason('');
    };

    const handleStatusConfirm = async () => {
        setStatusModal({ open: false, status: '' });
        await apiCall(`${API}/conciliacion/matches/${match.id}/status`, {
            method: 'PATCH', body: JSON.stringify({ status: statusModal.status, reason: statusReason }),
        });
        onRefresh();
    };

    const handleSaveNotes = async () => {
        await apiCall(`${API}/conciliacion/matches/${match.id}/notes`, {
            method: 'PATCH', body: JSON.stringify({ notes: notesValue }),
        });
        setEditingNotes(false);
        onRefresh();
    };

    const handleDelete = async () => {
        if (!confirm('\u00bfEliminar este match? La transacci\u00f3n y el DTE volver\u00e1n a estado pendiente.')) return;
        await apiCall(`${API}/conciliacion/matches/${match.id}`, { method: 'DELETE' });
        onRefresh();
    };

    const loadHistory = async () => {
        const data = await apiCall(`${API}/conciliacion/matches/${match.id}/history`, { method: 'GET' });
        if (data) setHistory(data);
    };

    const statusBadge = match.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700'
        : match.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
    const statusLabel = match.status === 'CONFIRMED' ? 'Confirmado'
        : match.status === 'REJECTED' ? 'Rechazado' : 'Borrador';

    const ruleClean = (match.ruleApplied || '').replace(/\s*-\s*.*$/, '');

    return (
        <>
            <div className={`px-6 py-4 transition-colors ${expanded ? 'bg-slate-50/60' : 'hover:bg-emerald-50/30'}`}>
                <div className="flex items-start justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
                    <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
                            <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                            <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadge}`}>{statusLabel}</span>
                            <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-bold border border-slate-200 flex items-center">
                                {match.origin === 'AUTOMATIC' ? <SparklesIcon className="h-3 w-3 mr-1 text-indigo-500" /> : <UsersIcon className="h-3 w-3 mr-1 text-slate-500" />}
                                {match.origin === 'AUTOMATIC' ? 'AUTO' : 'MANUAL'}
                            </span>
                            {ruleClean && (
                                <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{ruleClean}</span>
                            )}
                            <span className="text-xs text-slate-500">{(match.confidence * 100).toFixed(0)}%</span>
                            {match.notes && <ChatBubbleLeftIcon className="h-4 w-4 text-blue-400" />}
                            {expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Transaccion</div>
                                <div className="font-medium text-slate-900">{match.transaction.description}</div>
                                <div className="text-xs text-slate-600">{formatDate(match.transaction.date)} &bull; {formatCurrency(match.transaction.amount)}</div>
                            </div>
                            {match.dte && (
                                <div>
                                    <div className="text-xs text-slate-500 mb-1">DTE</div>
                                    <div className="font-medium text-slate-900">Folio {match.dte.folio} - {match.dte.provider?.name}</div>
                                    <div className="text-xs text-slate-600">Tipo {match.dte.type} &bull; {formatCurrency(match.dte.totalAmount)}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="text-xs text-slate-400 text-right shrink-0 ml-4">
                        {new Date(match.createdAt).toLocaleString('es-CL')}
                    </div>
                </div>

                {expanded && (
                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-slate-600 flex items-center">
                                    <ChatBubbleLeftIcon className="h-4 w-4 mr-1" /> Comentarios
                                </label>
                                {!editingNotes && (
                                    <button onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center">
                                        <PencilSquareIcon className="h-3 w-3 mr-1" /> Editar
                                    </button>
                                )}
                            </div>
                            {editingNotes ? (
                                <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                    <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={3}
                                        placeholder="Escribe un comentario..."
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                                    <div className="flex space-x-2">
                                        <button onClick={handleSaveNotes} disabled={busy}
                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                                        <button onClick={() => { setEditingNotes(false); setNotesValue(match.notes || ''); }}
                                            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                match.notes
                                    ? <div className="p-2 bg-slate-50 border-l-2 border-blue-300 text-xs text-slate-600 italic whitespace-pre-wrap">{match.notes}</div>
                                    : <div className="text-xs text-slate-400 italic">Sin comentarios</div>
                            )}
                        </div>

                        <div className="flex items-center space-x-2 flex-wrap gap-y-2" onClick={e => e.stopPropagation()}>
                            {match.status !== 'CONFIRMED' && (
                                <button onClick={() => openStatusModal('CONFIRMED')} disabled={busy}
                                    className="flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                                    <HandThumbUpIcon className="h-4 w-4 mr-1" /> Confirmar
                                </button>
                            )}
                            {match.status !== 'REJECTED' && (
                                <button onClick={() => openStatusModal('REJECTED')} disabled={busy}
                                    className="flex items-center px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50 shadow-sm">
                                    <HandThumbDownIcon className="h-4 w-4 mr-1" /> Rechazar
                                </button>
                            )}
                            <button onClick={handleDelete} disabled={busy}
                                className="flex items-center px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50">
                                <TrashIcon className="h-4 w-4 mr-1" /> Eliminar
                            </button>
                            <button onClick={loadHistory} disabled={busy}
                                className="flex items-center px-3 py-1.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-200 disabled:opacity-50">
                                <ClockIcon className="h-4 w-4 mr-1" /> Historial
                            </button>
                        </div>

                        {history && (
                            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                <h4 className="text-xs font-semibold text-slate-600 mb-2">Historial de cambios</h4>
                                {history.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">Sin cambios registrados</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {history.map((log: any) => (
                                            <div key={log.id} className="flex items-start space-x-2 text-xs">
                                                <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1 shrink-0" />
                                                <div>
                                                    <span className="font-medium text-slate-700">{log.action}</span>
                                                    <span className="text-slate-400 mx-1">por</span>
                                                    <span className="text-indigo-600 font-medium">{log.userId || 'sistema'}</span>
                                                    <span className="text-slate-400 ml-2">{new Date(log.createdAt).toLocaleString('es-CL')}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Status Modal */}
            {statusModal.open && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setStatusModal({ open: false, status: '' })}>
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-slate-800 mb-3">
                            {statusModal.status === 'CONFIRMED' ? 'Confirmar Match' : 'Rechazar Match'}
                        </h3>
                        <textarea value={statusReason} onChange={e => setStatusReason(e.target.value)}
                            placeholder="Motivo (opcional)..." rows={3}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-4" />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setStatusModal({ open: false, status: '' })}
                                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancelar</button>
                            <button onClick={handleStatusConfirm}
                                className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${statusModal.status === 'CONFIRMED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                                {statusModal.status === 'CONFIRMED' ? 'Confirmar' : 'Rechazar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Manual Match Section ──

function ManualMatchSection({ onRefresh }: { onRefresh: () => void }) {
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
            const { authFetch } = await import('@/lib/auth');
            const params = new URLSearchParams({ search: txSearch, statusFilter: 'PENDING', limit: '20' });
            const res = await authFetch(`${API}/transactions?${params}`);
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
            const { authFetch } = await import('@/lib/auth');
            const params = new URLSearchParams({ search: dteSearch, paymentStatus: 'UNPAID', limit: '20' });
            const res = await authFetch(`${API}/dtes?${params}`);
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
            const { authFetch } = await import('@/lib/auth');
            const res = await authFetch(`${API}/conciliacion/matches/manual`, {
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

    return (
        <div className="bg-white shadow-xl shadow-slate-200/50 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center space-x-2">
                    <PlusCircleIcon className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-700">Crear Match Manual</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">Busca una transaccion pendiente y una factura sin pagar para vincularlas manualmente</p>
            </div>
            <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Transaction Search */}
                    <div>
                        <label className="text-sm font-semibold text-slate-700 mb-2 block">Transaccion Bancaria</label>
                        <div className="flex space-x-2 mb-3">
                            <input type="text" value={txSearch} onChange={e => setTxSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchTxs()}
                                placeholder="Buscar por descripcion o referencia..."
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                            <button onClick={searchTxs} disabled={txLoading}
                                className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50">
                                <MagnifyingGlassIcon className="h-4 w-4" />
                            </button>
                        </div>
                        {selectedTx && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                                <div>
                                    <div className="text-sm font-medium text-indigo-900">{selectedTx.description}</div>
                                    <div className="text-xs text-indigo-600">{formatDate(selectedTx.date)} &bull; {formatCurrency(selectedTx.amount)}</div>
                                </div>
                                <button onClick={() => setSelectedTx(null)}><XMarkIcon className="h-4 w-4 text-indigo-400 hover:text-indigo-600" /></button>
                            </div>
                        )}
                        {pendingTxs.length > 0 && !selectedTx && (
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {pendingTxs.map((tx: any) => (
                                    <button key={tx.id} onClick={() => setSelectedTx(tx)}
                                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors">
                                        <div className="text-sm font-medium text-slate-900 truncate">{tx.description}</div>
                                        <div className="text-xs text-slate-500">{formatDate(tx.date)} &bull; {formatCurrency(tx.amount)}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* DTE Search */}
                    <div>
                        <label className="text-sm font-semibold text-slate-700 mb-2 block">Factura (DTE)</label>
                        <div className="flex space-x-2 mb-3">
                            <input type="text" value={dteSearch} onChange={e => setDteSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchDtes()}
                                placeholder="Buscar por folio, proveedor..."
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                            <button onClick={searchDtes} disabled={dteLoading}
                                className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50">
                                <MagnifyingGlassIcon className="h-4 w-4" />
                            </button>
                        </div>
                        {selectedDte && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                                <div>
                                    <div className="text-sm font-medium text-emerald-900">Folio {selectedDte.folio} - {selectedDte.provider?.name || 'Sin proveedor'}</div>
                                    <div className="text-xs text-emerald-600">{formatDate(selectedDte.issuedDate)} &bull; {formatCurrency(selectedDte.totalAmount)}</div>
                                </div>
                                <button onClick={() => setSelectedDte(null)}><XMarkIcon className="h-4 w-4 text-emerald-400 hover:text-emerald-600" /></button>
                            </div>
                        )}
                        {unpaidDtes.length > 0 && !selectedDte && (
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {unpaidDtes.map((dte: any) => (
                                    <button key={dte.id} onClick={() => setSelectedDte(dte)}
                                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors">
                                        <div className="text-sm font-medium text-slate-900">Folio {dte.folio} - {dte.provider?.name || ''}</div>
                                        <div className="text-xs text-slate-500">{formatDate(dte.issuedDate)} &bull; {formatCurrency(dte.totalAmount)}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {selectedTx && selectedDte && (
                    <div className="mt-6 border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                            <div className="text-sm">
                                <span className="font-medium text-slate-900">{selectedTx.description}</span>
                                <span className="text-slate-400 mx-3">&harr;</span>
                                <span className="font-medium text-slate-900">Folio {selectedDte.folio}</span>
                                <span className="text-slate-400 mx-2">&bull;</span>
                                <span className={`font-bold ${Math.abs(Math.abs(selectedTx.amount) - Math.abs(selectedDte.totalAmount)) <= 1000 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    Dif: {formatCurrency(Math.abs(Math.abs(selectedTx.amount) - Math.abs(selectedDte.totalAmount)))}
                                </span>
                            </div>
                            <button onClick={createManualMatch} disabled={creating}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-2">
                                <LinkIcon className="h-4 w-4" />
                                <span>Crear Match</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
