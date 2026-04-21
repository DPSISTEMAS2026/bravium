
'use client';

import { useState, useEffect } from 'react';
import {
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    CheckCircleIcon,
    ClockIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    UserGroupIcon,
    ChartBarIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    ArrowPathIcon,
    BellAlertIcon,
    ExclamationCircleIcon,
    DocumentMagnifyingGlassIcon,
    BanknotesIcon,
    SignalIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { getApiUrl, authFetch } from '../lib/api';

interface BriefingData {
    generatedAt: string;
    queryTimeMs: number;
    matchesPorRevisar: {
        total: number;
        montoTotal: number;
        items: any[];
    };
    pagosPendientes: {
        total: number;
        montoTotal: number;
        proveedoresAfectados: number;
        items: any[];
    };
    sinDocumento: {
        total: number;
        montoTotal: number;
        items: any[];
    };
    proveedores: {
        conDeuda: number;
        deudaTotal: number;
        top5: any[];
    };
    sincronizacion: {
        lastDteSync: any;
        lastAutoMatch: any;
        healthy: boolean;
    };
}

interface DashboardStats {
    proveedores: { total: number; conDeuda: number; deudaTotal: number };
    facturas: { total: number; pendientes: number; vencidas: number; montoTotal: number; montoPendiente: number };
    transacciones: { total: number; conciliadas: number; pendientes: number; tasaConciliacion: number };
    flujo: { ingresos: number; egresos: number; neto: number };
}

export default function HomePage() {
    const [briefing, setBriefing] = useState<BriefingData | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [briefingError, setBriefingError] = useState(false);

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        await Promise.all([loadBriefing(), loadDashboardData()]);
        setLoading(false);
    };

    const loadBriefing = async () => {
        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/conciliacion/briefing`);
            if (res.ok) {
                setBriefing(await res.json());
                setBriefingError(false);
            } else {
                setBriefingError(true);
            }
        } catch {
            setBriefingError(true);
        }
    };

    const loadDashboardData = async () => {
        try {
            const API_URL = getApiUrl();
            const [proveedoresRes, dtesRes, transactionsRes] = await Promise.all([
                authFetch(`${API_URL}/proveedores`),
                authFetch(`${API_URL}/dtes/summary?fromDate=2026-01-01&toDate=2026-12-31`),
                authFetch(`${API_URL}/transactions/summary?fromDate=2026-01-01&toDate=2026-12-31`),
            ]);

            const [proveedoresPayload, dtesSummary, txSummary] = await Promise.all([
                proveedoresRes.json(), dtesRes.json(), transactionsRes.json(),
            ]);

            const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : (proveedoresPayload?.data ?? []);
            const proveedoresTotal = typeof proveedoresPayload?.total === 'number' ? proveedoresPayload.total : proveedoresList.length;
            const proveedoresConDeuda = proveedoresList.filter((p: any) => p.totalDebt > 0);
            const deudaTotal = proveedoresList.reduce((sum: number, p: any) => sum + p.totalDebt, 0);

            setStats({
                proveedores: { total: proveedoresTotal, conDeuda: proveedoresConDeuda.length, deudaTotal },
                facturas: {
                    total: dtesSummary.total || 0, pendientes: dtesSummary.byStatus?.UNPAID || 0,
                    vencidas: 0, montoTotal: dtesSummary.totalAmount || 0, montoPendiente: dtesSummary.totalOutstanding || 0,
                },
                transacciones: {
                    total: txSummary.total || 0, conciliadas: txSummary.matched || 0,
                    pendientes: txSummary.unmatched || 0, tasaConciliacion: txSummary.matchRate || 0,
                },
                flujo: {
                    ingresos: txSummary.totalCredits || 0, egresos: txSummary.totalDebits || 0, neto: txSummary.netFlow || 0,
                },
            });
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);

    const formatTimeAgo = (dateStr: string) => {
        if (!dateStr) return 'Sin datos';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `Hace ${mins} min`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `Hace ${hours}h`;
        const days = Math.floor(hours / 24);
        return `Hace ${days}d`;
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Buenos días';
        if (hour < 18) return 'Buenas tardes';
        return 'Buenas noches';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <ArrowPathIcon className="h-12 w-12 text-teal-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 font-medium tracking-tight text-sm">Preparando tu resumen del día...</p>
                </div>
            </div>
        );
    }

    // Count total alerts
    const totalAlerts = briefing
        ? (briefing.matchesPorRevisar.total > 0 ? 1 : 0)
          + (briefing.pagosPendientes.total > 0 ? 1 : 0)
          + (briefing.sinDocumento.total > 0 ? 1 : 0)
        : 0;

    return (
        <div className="space-y-6">
            {/* ===== HEADER ===== */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-0.5">
                        {getGreeting()} 👋
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Este es tu resumen de hoy • {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
                <button onClick={loadAll} className="btn-ghost flex items-center space-x-2 text-sm">
                    <ArrowPathIcon className="h-4 w-4" />
                    <span>Actualizar</span>
                </button>
            </div>

            {/* ===== SYNC STATUS BAR ===== */}
            {briefing && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                        <SignalIcon className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado del sistema</span>
                    </div>
                    <div className="flex items-center gap-4 ml-auto flex-wrap">
                        {/* DTE Sync */}
                        <div className="flex items-center gap-1.5">
                            {briefing.sincronizacion.healthy ? (
                                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <ExclamationCircleIcon className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="text-xs text-slate-600">
                                Sync DTEs: {briefing.sincronizacion.lastDteSync
                                    ? <strong className={briefing.sincronizacion.healthy ? 'text-emerald-600' : 'text-amber-600'}>
                                        {formatTimeAgo(briefing.sincronizacion.lastDteSync.finishedAt || briefing.sincronizacion.lastDteSync.startedAt)}
                                      </strong>
                                    : <strong className="text-slate-400">Sin datos</strong>
                                }
                            </span>
                        </div>
                        {/* Auto-Match */}
                        <div className="flex items-center gap-1.5">
                            {briefing.sincronizacion.lastAutoMatch ? (
                                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                            ) : (
                                <ClockIcon className="h-4 w-4 text-slate-400" />
                            )}
                            <span className="text-xs text-slate-600">
                                Auto-Match: {briefing.sincronizacion.lastAutoMatch
                                    ? <strong className="text-emerald-600">
                                        {formatTimeAgo(briefing.sincronizacion.lastAutoMatch.finishedAt || briefing.sincronizacion.lastAutoMatch.startedAt)}
                                      </strong>
                                    : <strong className="text-slate-400">Pendiente</strong>
                                }
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== BRIEFING ALERTS (Action Cards) ===== */}
            {briefing && totalAlerts > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Matches por revisar */}
                    {briefing.matchesPorRevisar.total > 0 && (
                        <Link href="/cartolas?status=PARTIALLY_MATCHED&fromDate=2026-01-01&toDate=2026-12-31" className="group relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 hover:shadow-lg hover:shadow-indigo-100 transition-all">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2.5 bg-indigo-100 rounded-xl group-hover:bg-indigo-200 transition-colors">
                                    <SparklesIcon className="h-5 w-5 text-indigo-600" />
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                                    ACCIÓN REQUERIDA
                                </span>
                            </div>
                            <div className="text-3xl font-bold text-indigo-900 mb-0.5">{briefing.matchesPorRevisar.total}</div>
                            <div className="text-sm font-semibold text-indigo-700 mb-1">Matchs por revisar</div>
                            <p className="text-xs text-indigo-500">
                                Conciliaciones automáticas esperando tu aprobación por {formatCurrency(briefing.matchesPorRevisar.montoTotal)}
                            </p>
                        </Link>
                    )}

                    {/* Pagos Pendientes */}
                    {briefing.pagosPendientes.total > 0 && (
                        <Link href={`/facturas?paymentStatus=UNPAID&fromDate=2026-01-01&toDate=2026-12-31`} className="group relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 hover:shadow-lg hover:shadow-amber-100 transition-all">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2.5 bg-amber-100 rounded-xl group-hover:bg-amber-200 transition-colors">
                                    <BanknotesIcon className="h-5 w-5 text-amber-600" />
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                                    PENDIENTE
                                </span>
                            </div>
                            <div className="text-3xl font-bold text-amber-900 mb-0.5">{briefing.pagosPendientes.total}</div>
                            <div className="text-sm font-semibold text-amber-700 mb-1">Pagos a proveedores</div>
                            <p className="text-xs text-amber-600">
                                {briefing.pagosPendientes.proveedoresAfectados} proveedores con {formatCurrency(briefing.pagosPendientes.montoTotal)} pendientes
                            </p>
                        </Link>
                    )}

                    {/* Sin Documento */}
                    {briefing.sinDocumento.total > 0 && (
                        <Link href="/cartolas?status=PENDING&fromDate=2026-01-01&toDate=2026-12-31" className="group relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-rose-50 to-red-50 border border-rose-200 hover:shadow-lg hover:shadow-rose-100 transition-all">
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2.5 bg-rose-100 rounded-xl group-hover:bg-rose-200 transition-colors">
                                    <DocumentMagnifyingGlassIcon className="h-5 w-5 text-rose-600" />
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                                    SIN FACTURA
                                </span>
                            </div>
                            <div className="text-3xl font-bold text-rose-900 mb-0.5">{briefing.sinDocumento.total}</div>
                            <div className="text-sm font-semibold text-rose-700 mb-1">Movimientos sin DTE</div>
                            <p className="text-xs text-rose-500">
                                Pagos por {formatCurrency(briefing.sinDocumento.montoTotal)} sin documento tributario asociado
                            </p>
                        </Link>
                    )}
                </div>
            )}

            {/* ===== "ALL CLEAR" message ===== */}
            {briefing && totalAlerts === 0 && (
                <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-center">
                    <ShieldCheckIcon className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-emerald-800 mb-1">Todo al día ✓</h3>
                    <p className="text-sm text-emerald-600">No tienes alertas pendientes. Todos los matchs están revisados y los pagos al día.</p>
                </div>
            )}

            {/* ===== STATS GRID ===== */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Proveedores */}
                    <Link href="/proveedores" className="card-glass p-5 hover:shadow-xl transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-teal-50 transition-colors">
                                <UserGroupIcon className="h-5 w-5 text-slate-600 group-hover:text-teal-600" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {stats.proveedores.conDeuda} CON DEUDA
                            </span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900 mb-0.5">{stats.proveedores.total}</div>
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Proveedores</div>
                        <div className="mt-3 text-[11px] text-slate-400">Deuda: {formatCurrency(stats.proveedores.deudaTotal)}</div>
                    </Link>

                    {/* Facturas */}
                    <Link href={`/facturas?paymentStatus=UNPAID&fromDate=2026-01-01&toDate=${new Date().toISOString().split('T')[0]}`} className="card-glass p-5 hover:shadow-xl transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-violet-50 transition-colors">
                                <DocumentTextIcon className="h-5 w-5 text-slate-600 group-hover:text-violet-600" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {stats.facturas.pendientes} PENDIENTES
                            </span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900 mb-0.5">{stats.facturas.total}</div>
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Facturas (DTE)</div>
                        <div className="mt-3 text-[11px] text-slate-400">Total: {formatCurrency(stats.facturas.montoPendiente)}</div>
                    </Link>

                    {/* Transacciones */}
                    <Link href="/cartolas?fromDate=2026-01-01&toDate=2026-12-31" className="card-glass p-5 hover:shadow-xl transition-all group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-2.5 bg-slate-100 rounded-xl group-hover:bg-emerald-50 transition-colors">
                                <ChartBarIcon className="h-5 w-5 text-slate-600 group-hover:text-emerald-600" />
                            </div>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                                {stats.transacciones.tasaConciliacion.toFixed(0)}% MATCH
                            </span>
                        </div>
                        <div className="text-3xl font-bold text-slate-900 mb-0.5">{stats.transacciones.total}</div>
                        <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Transacciones</div>
                        <div className="mt-3 text-[11px] text-slate-400">{stats.transacciones.conciliadas} conciliadas</div>
                    </Link>
                </div>
            )}

            {/* ===== TOP PROVEEDORES CON DEUDA ===== */}
            {briefing && briefing.proveedores.conDeuda > 0 && (
                <div className="card-glass p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
                            <h3 className="font-bold text-slate-800 text-sm">Proveedores con deuda pendiente</h3>
                        </div>
                        <Link href="/proveedores" className="text-xs font-semibold text-teal-600 hover:text-teal-700">
                            Ver todos →
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {briefing.proveedores.top5.map((p: any, i: number) => (
                            <Link href={`/proveedores/${p.id}`} key={p.id} className="flex items-center justify-between py-2.5 px-2 -mx-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors block">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800 group-hover:text-teal-600 transition-colors">{p.name}</div>
                                        <div className="text-[11px] text-slate-400">{p.rut}</div>
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-amber-600">{formatCurrency(p.currentBalance)}</div>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-xs text-slate-500">{briefing.proveedores.conDeuda} proveedores con deuda</span>
                        <span className="text-sm font-bold text-slate-800">Total: {formatCurrency(briefing.proveedores.deudaTotal)}</span>
                    </div>
                </div>
            )}

            {/* ===== QUICK ACTIONS ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a href="/cartolas?fromDate=2026-01-01&toDate=2026-12-31" className="card p-5 hover:shadow-lg transition-all border border-slate-200 group">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-teal-50 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all text-teal-600">
                            <SparklesIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm">Auto-Match</h3>
                            <p className="text-xs text-slate-500">Conciliación inteligente en Cartolas</p>
                        </div>
                    </div>
                </a>

                <Link href="/facturas?fromDate=2026-01-01&toDate=2026-12-31" className="card p-5 hover:shadow-lg transition-all border border-slate-200 group">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-violet-50 rounded-xl group-hover:bg-violet-600 group-hover:text-white transition-all text-violet-600">
                            <DocumentTextIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm">Facturación</h3>
                            <p className="text-xs text-slate-500">DTEs y estados de pago</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
