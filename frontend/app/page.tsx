'use client';

import { useState, useEffect } from 'react';
import {
    ChartBarIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    UserGroupIcon,
    ArrowTrendingUpIcon,
    ArrowTrendingDownIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

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
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

            // Cargar datos en paralelo
            const [proveedoresRes, dtesRes, transactionsRes] = await Promise.all([
                fetch(`${API_URL}/proveedores`),
                fetch(`${API_URL}/dtes/summary?fromDate=2026-01-01&toDate=2026-01-31`),
                fetch(`${API_URL}/transactions/summary?fromDate=2026-01-01&toDate=2026-01-31`),
            ]);

            const [proveedores, dtesSummary, txSummary] = await Promise.all([
                proveedoresRes.json(),
                dtesRes.json(),
                transactionsRes.json(),
            ]);

            // Calcular estadísticas
            const proveedoresConDeuda = proveedores.filter((p: any) => p.totalDebt > 0);
            const deudaTotal = proveedores.reduce((sum: number, p: any) => sum + p.totalDebt, 0);

            setStats({
                proveedores: {
                    total: proveedores.length,
                    conDeuda: proveedoresConDeuda.length,
                    deudaTotal,
                },
                facturas: {
                    total: dtesSummary.total || 0,
                    pendientes: dtesSummary.byStatus?.UNPAID || 0,
                    vencidas: 0, // Calcularemos esto después
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
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                <p className="text-red-800 font-semibold">Error al cargar el dashboard</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold gradient-text mb-2">
                    Dashboard Financiero
                </h1>
                <p className="text-slate-600">
                    Resumen ejecutivo de tu gestión financiera - Enero 2026
                </p>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Proveedores */}
                <Link href="/proveedores" className="stat-card bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <UserGroupIcon className="h-10 w-10 text-blue-600" />
                        <span className="text-xs font-bold text-blue-700 bg-blue-200 px-3 py-1 rounded-full">
                            {stats.proveedores.conDeuda} con deuda
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-blue-900 mb-2">
                        {stats.proveedores.total}
                    </div>
                    <div className="text-sm text-blue-700 font-medium mb-3">Proveedores Activos</div>
                    <div className="text-xs text-blue-600">
                        Deuda total: {formatCurrency(stats.proveedores.deudaTotal)}
                    </div>
                </Link>

                {/* Facturas */}
                <Link href="/facturas" className="stat-card bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <DocumentTextIcon className="h-10 w-10 text-purple-600" />
                        <span className="text-xs font-bold text-purple-700 bg-purple-200 px-3 py-1 rounded-full">
                            {stats.facturas.pendientes} pendientes
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-purple-900 mb-2">
                        {stats.facturas.total}
                    </div>
                    <div className="text-sm text-purple-700 font-medium mb-3">Facturas (DTEs)</div>
                    <div className="text-xs text-purple-600">
                        Por pagar: {formatCurrency(stats.facturas.montoPendiente)}
                    </div>
                </Link>

                {/* Transacciones */}
                <Link href="/conciliacion" className="stat-card bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 hover:shadow-2xl hover:scale-105 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                        <ChartBarIcon className="h-10 w-10 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-200 px-3 py-1 rounded-full">
                            {stats.transacciones.tasaConciliacion.toFixed(0)}% match
                        </span>
                    </div>
                    <div className="text-4xl font-bold text-emerald-900 mb-2">
                        {stats.transacciones.total}
                    </div>
                    <div className="text-sm text-emerald-700 font-medium mb-3">Transacciones</div>
                    <div className="text-xs text-emerald-600">
                        {stats.transacciones.conciliadas} conciliadas
                    </div>
                </Link>

                {/* Flujo Neto */}
                <div className={`stat-card bg-gradient-to-br ${stats.flujo.neto >= 0
                    ? 'from-green-50 to-green-100 border-2 border-green-200'
                    : 'from-red-50 to-red-100 border-2 border-red-200'
                    } hover:shadow-2xl hover:scale-105 transition-all duration-300`}>
                    <div className="flex items-center justify-between mb-4">
                        <CurrencyDollarIcon className={`h-10 w-10 ${stats.flujo.neto >= 0 ? 'text-green-600' : 'text-red-600'
                            }`} />
                        {stats.flujo.neto >= 0 ? (
                            <ArrowTrendingUpIcon className="h-6 w-6 text-green-600" />
                        ) : (
                            <ArrowTrendingDownIcon className="h-6 w-6 text-red-600" />
                        )}
                    </div>
                    <div className={`text-3xl font-bold mb-2 ${stats.flujo.neto >= 0 ? 'text-green-900' : 'text-red-900'
                        }`}>
                        {formatCurrency(Math.abs(stats.flujo.neto))}
                    </div>
                    <div className={`text-sm font-medium mb-3 ${stats.flujo.neto >= 0 ? 'text-green-700' : 'text-red-700'
                        }`}>
                        Flujo Neto
                    </div>
                    <div className={`text-xs ${stats.flujo.neto >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {stats.flujo.neto >= 0 ? 'Superávit' : 'Déficit'}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link
                    href="/conciliacion"
                    className="card p-6 hover:shadow-2xl group"
                >
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">
                            <CheckCircleIcon className="h-8 w-8 text-blue-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 mb-1">
                                Conciliación Bancaria
                            </h3>
                            <p className="text-sm text-slate-600">
                                {stats.transacciones.pendientes} transacciones pendientes
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/reportes"
                    className="card p-6 hover:shadow-2xl group"
                >
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-purple-100 rounded-xl group-hover:bg-purple-200 transition-colors">
                            <ChartBarIcon className="h-8 w-8 text-purple-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 mb-1">
                                Reportes Financieros
                            </h3>
                            <p className="text-sm text-slate-600">
                                Análisis y exportación de datos
                            </p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/proveedores"
                    className="card p-6 hover:shadow-2xl group"
                >
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-amber-100 rounded-xl group-hover:bg-amber-200 transition-colors">
                            <ExclamationTriangleIcon className="h-8 w-8 text-amber-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 mb-1">
                                Gestión de Deuda
                            </h3>
                            <p className="text-sm text-slate-600">
                                {stats.proveedores.conDeuda} proveedores con saldo pendiente
                            </p>
                        </div>
                    </div>
                </Link>
            </div>

            {/* Info Banner */}
            <div className="card p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
                <div className="flex items-start space-x-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <DocumentTextIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 mb-2">
                            Sistema de Conciliación Inteligente
                        </h3>
                        <p className="text-sm text-slate-600 mb-3">
                            BRAVIUM integra automáticamente tus facturas desde LibreDTE con las transacciones bancarias de tus cartolas,
                            facilitando la conciliación y el control financiero en tiempo real.
                        </p>
                        <div className="flex items-center space-x-4 text-xs text-slate-500">
                            <span className="flex items-center">
                                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                                Sincronización automática con LibreDTE
                            </span>
                            <span className="flex items-center">
                                <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                                Procesamiento de cartolas bancarias
                            </span>
                            <span className="flex items-center">
                                <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                                Matching automático de pagos
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
