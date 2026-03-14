
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
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { getApiUrl } from '../lib/api';

interface DashboardStats {
    proveedores: {
        total: number;
        conDeuda: number;
        deudaTotal: number;
    };
    facturas: {
        total: number;
        pendientes: number;
        vencidas: number;
        montoTotal: number;
        montoPendiente: number;
    };
    transacciones: {
        total: number;
        conciliadas: number;
        pendientes: number;
        tasaConciliacion: number;
    };
    flujo: {
        ingresos: number;
        egresos: number;
        neto: number;
    };
}

export default function HomePage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const API_URL = getApiUrl();

            // Cargar datos reales (resumen DTEs con rango que incluya 2025 y 2026 para ver datos)
            const [proveedoresRes, dtesRes, transactionsRes] = await Promise.all([
                fetch(`${API_URL}/proveedores`),
                fetch(`${API_URL}/dtes/summary?fromDate=2025-01-01&toDate=2026-12-31`),
                fetch(`${API_URL}/transactions/summary`),
            ]);

            const [proveedoresPayload, dtesSummary, txSummary] = await Promise.all([
                proveedoresRes.json(),
                dtesRes.json(),
                transactionsRes.json(),
            ]);

            // API devuelve { data, total, page, limit, totalPages }; usar data para cálculos
            const proveedoresList = Array.isArray(proveedoresPayload) ? proveedoresPayload : (proveedoresPayload?.data ?? []);
            const proveedoresTotal = typeof proveedoresPayload?.total === 'number' ? proveedoresPayload.total : proveedoresList.length;

            const proveedoresConDeuda = proveedoresList.filter((p: any) => p.totalDebt > 0);
            const deudaTotal = proveedoresList.reduce((sum: number, p: any) => sum + p.totalDebt, 0);

            setStats({
                proveedores: {
                    total: proveedoresTotal,
                    conDeuda: proveedoresConDeuda.length,
                    deudaTotal,
                },
                facturas: {
                    total: dtesSummary.total || 0,
                    pendientes: dtesSummary.byStatus?.UNPAID || 0,
                    vencidas: 0,
                    montoTotal: dtesSummary.totalAmount || 0,
                    montoPendiente: dtesSummary.totalOutstanding || 0,
                },
                transacciones: {
                    total: txSummary.total || 0,
                    conciliadas: txSummary.matched || 0,
                    pendientes: txSummary.unmatched || 0,
                    tasaConciliacion: txSummary.matchRate || 0,
                },
                flujo: {
                    ingresos: txSummary.totalCredits || 0,
                    egresos: txSummary.totalDebits || 0,
                    neto: txSummary.netFlow || 0,
                },
            });
        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <ArrowPathIcon className="h-12 w-12 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 font-medium tracking-tight uppercase text-xs">Sincronizando Dashboard...</p>
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <p className="text-red-800 font-semibold">Error al conectar con la API de Bravium</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-1">
                        Dashboard Financiero
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        Resumen ejecutivo de gestión empresarial en tiempo real
                    </p>
                </div>
                <button onClick={loadDashboardData} className="btn-ghost flex items-center space-x-2">
                    <ArrowPathIcon className="h-4 w-4" />
                    <span>Actualizar</span>
                </button>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Proveedores */}
                <Link href="/proveedores" className="card-glass p-6 hover:shadow-xl transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-indigo-50 transition-colors">
                            <UserGroupIcon className="h-6 w-6 text-slate-600 group-hover:text-indigo-600" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                            {stats.proveedores.conDeuda} ACTIVOS
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">{stats.proveedores.total}</div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Proveedores</div>
                    <div className="mt-4 text-[11px] text-slate-400 font-medium">Deuda: {formatCurrency(stats.proveedores.deudaTotal)}</div>
                </Link>

                {/* Facturas */}
                <Link href="/facturas" className="card-glass p-6 hover:shadow-xl transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-violet-50 transition-colors">
                            <DocumentTextIcon className="h-6 w-6 text-slate-600 group-hover:text-violet-600" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                            {stats.facturas.pendientes} PENDIENTES
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">{stats.facturas.total}</div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Facturas (DTE)</div>
                    <div className="mt-4 text-[11px] text-slate-400 font-medium">Total: {formatCurrency(stats.facturas.montoPendiente)}</div>
                </Link>

                {/* Transacciones */}
                <Link href="/conciliacion" className="card-glass p-6 hover:shadow-xl transition-all group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-emerald-50 transition-colors">
                            <ChartBarIcon className="h-6 w-6 text-slate-600 group-hover:text-emerald-600" />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                            {stats.transacciones.tasaConciliacion.toFixed(0)}% MATCH
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-1">{stats.transacciones.total}</div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Transacciones</div>
                    <div className="mt-4 text-[11px] text-slate-400 font-medium">{stats.transacciones.conciliadas} conciliadas</div>
                </Link>

                {/* Flujo Neto */}
                <div className="card-glass p-6 hover:shadow-xl transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-xl ${stats.flujo.neto >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            <CurrencyDollarIcon className="h-6 w-6" />
                        </div>
                        {stats.flujo.neto >= 0 ? (
                            <ArrowTrendingUpIcon className="h-4 w-4 text-emerald-600" />
                        ) : (
                            <ArrowTrendingDownIcon className="h-4 w-4 text-red-600" />
                        )}
                    </div>
                    <div className={`text-3xl font-bold mb-1 ${stats.flujo.neto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatCurrency(Math.abs(stats.flujo.neto))}
                    </div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Flujo Neto</div>
                    <div className={`mt-4 text-[10px] font-bold uppercase tracking-tighter ${stats.flujo.neto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {stats.flujo.neto >= 0 ? 'Estructura Saludable' : 'Revisar Egresos'}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/conciliacion" className="card p-6 hover:shadow-lg transition-all border border-slate-200 group">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all text-indigo-600">
                            <SparklesIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Auto-Match</h3>
                            <p className="text-xs text-slate-500">Conciliación inteligente masiva</p>
                        </div>
                    </div>
                </Link>

                <Link href="/facturas" className="card p-6 hover:shadow-lg transition-all border border-slate-200 group">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-violet-50 rounded-xl group-hover:bg-violet-600 group-hover:text-white transition-all text-violet-600">
                            <DocumentTextIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Facturación</h3>
                            <p className="text-xs text-slate-500">Gestión DTE y estados de pago</p>
                        </div>
                    </div>
                </Link>

                <Link href="/reportes" className="card p-6 hover:shadow-lg transition-all border border-slate-200 group">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-all text-slate-600">
                            <ChartBarIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900">Inteligencia</h3>
                            <p className="text-xs text-slate-500">Reportes y KPIs financieros</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
