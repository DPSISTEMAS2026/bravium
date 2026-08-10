'use client';

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
    BuildingOffice2Icon,
    DocumentTextIcon,
    CreditCardIcon,
    ArrowPathIcon,
    ChevronRightIcon,
    ArrowTopRightOnSquareIcon,
    BanknotesIcon,
    CheckCircleIcon,
    ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, apiFetcher } from '../../lib/api';
import { MonthlyBreakdownGrid } from '../../components/dashboard/monthly-breakdown';

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
    }).format(amount);
}

const REPORT_YEAR = 2026;

export default function DashboardPage() {
    const API_URL = getApiUrl();
    const from = `${REPORT_YEAR}-01-01`;
    const to = `${REPORT_YEAR}-12-31`;

    const { data: dashboard, error, isValidating, mutate } = useSWR(
        `${API_URL}/conciliacion/dashboard?fromDate=${from}&toDate=${to}`,
        apiFetcher
    );

    if (error) {
        return (
            <div className="py-12 px-4 text-center font-sans">
                <div className="bg-white border border-slate-300 rounded p-6 max-w-md mx-auto shadow-sm">
                    <p className="text-xs font-bold text-slate-800 mb-3">Error al conectar con el servidor de datos contables.</p>
                    <button
                        onClick={() => mutate()}
                        className="px-4 py-2 bg-slate-800 text-white font-semibold text-xs rounded hover:bg-slate-700 transition-colors"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div className="py-24 text-center font-sans">
                <ArrowPathIcon className="h-7 w-7 text-slate-700 animate-spin mx-auto mb-3" />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Cargando registros contables e informes SII...</p>
            </div>
        );
    }

    const topProviders: any[] = dashboard.insights?.top_providers || [];
    const totalDebt = dashboard.summary?.dtes?.outstanding_amount || 0;
    const unpaidDteCount = dashboard.summary?.dtes?.unpaid || 0;

    return (
        <div className="py-5 space-y-5 font-sans text-slate-900">
            {/* PORTAL CONTABLE HEADER (ESTILO SII / CMF) */}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
                <div className="bg-white border border-slate-300 rounded-lg p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="border-l-4 border-blue-900 pl-4 py-0.5">
                        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Informe de Cuadratura Contable y Registro de Deuda</h1>
                        <p className="text-xs text-slate-600 mt-0.5 font-medium">
                            Consolidado de Documentos Tributarios (DTE Recibidos) y Cartolas Bancarias — Ejercicio {REPORT_YEAR}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-100 px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 font-mono">
                            Rango: {dashboard.period.from} al {dashboard.period.to}
                        </div>
                        <button
                            onClick={() => mutate()}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                            title="Actualizar datos"
                        >
                            <ArrowPathIcon className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                            <span>Actualizar</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8 space-y-5">
                
                {/* PORTAL RESUMEN FINANCIERO (4 CUADROS DE RESUMEN CONTABLE) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Deuda Total a Proveedores */}
                    <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Deuda Total a Proveedores (DTE)</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
                            {formatCurrency(totalDebt)}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 border-t border-slate-200 pt-2 font-medium flex justify-between">
                            <span>Facturas Impagas:</span>
                            <span className="font-bold font-mono">{unpaidDteCount.toLocaleString('es-CL')} DTEs</span>
                        </div>
                    </div>

                    {/* Cargos Bancarios */}
                    <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Egresos en Cartolas</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
                            {formatCurrency(dashboard.summary?.transactions?.total_amount || 0)}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 border-t border-slate-200 pt-2 font-medium flex justify-between">
                            <span>Movimientos:</span>
                            <span className="font-bold font-mono">{dashboard.summary?.transactions?.total?.toLocaleString('es-CL') || 0} txs</span>
                        </div>
                    </div>

                    {/* Pendiente de Conciliar */}
                    <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Movimientos por Justificar</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
                            {dashboard.summary?.transactions?.pending?.toLocaleString('es-CL') || 0}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 border-t border-slate-200 pt-2 font-medium flex justify-between">
                            <span>Sin DTE asociado:</span>
                            <span className="font-bold text-slate-700">Por Vincular</span>
                        </div>
                    </div>

                    {/* Tasa de Cuadratura */}
                    <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avance de Cuadratura</div>
                        <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
                            {dashboard.summary?.transactions?.match_rate || '0%'}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 border-t border-slate-200 pt-2 font-medium flex justify-between">
                            <span>Conciliados:</span>
                            <span className="font-bold font-mono text-slate-800">{dashboard.summary?.transactions?.matched?.toLocaleString('es-CL') || 0} txs</span>
                        </div>
                    </div>
                </div>

                {/* TABLA OFICIAL: REGISTRO DE CUENTAS POR PAGAR (ESTILO SII / REGISTRO DE COMPRAS) */}
                <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
                    <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <ClipboardDocumentCheckIcon className="h-5 w-5 text-blue-400" />
                            <h2 className="text-xs font-bold uppercase tracking-wider">Registro de Cuentas por Pagar — Top Proveedores con Mayor Saldo Pendiente</h2>
                        </div>
                        <Link
                            href="/proveedores"
                            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded border border-slate-700 transition-colors shrink-0"
                        >
                            Ver Padrón de Proveedores
                        </Link>
                    </div>

                    {topProviders.length === 0 ? (
                        <div className="p-8 text-center text-xs font-medium text-slate-500">
                            No se registran proveedores con saldo deudor en este periodo.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-300">
                                    <tr>
                                        <th scope="col" className="py-2.5 px-3 w-12 text-center border-r border-slate-200">N°</th>
                                        <th scope="col" className="py-2.5 px-4 border-r border-slate-200">RUT Proveedor</th>
                                        <th scope="col" className="py-2.5 px-4 border-r border-slate-200">Razón Social</th>
                                        <th scope="col" className="py-2.5 px-4 text-center border-r border-slate-200">DTEs Impagos</th>
                                        <th scope="col" className="py-2.5 px-4 text-right border-r border-slate-200">Deuda Pendiente ($CLP)</th>
                                        <th scope="col" className="py-2.5 px-4 w-36 text-center border-r border-slate-200">% Participación</th>
                                        <th scope="col" className="py-2.5 px-4 w-28 text-center">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                    {topProviders.map((item, idx) => {
                                        const provName = item.provider?.name || 'Proveedor sin nombre';
                                        const provRut = item.provider?.rut || 'Sin RUT';
                                        const debtAmount = item.total_outstanding || 0;
                                        const dteCount = item.dte_count || 0;
                                        const sharePct = totalDebt > 0 ? ((debtAmount / totalDebt) * 100) : 0;

                                        return (
                                            <tr key={item.provider?.id || idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-3 font-mono font-bold text-center text-slate-500 border-r border-slate-100">
                                                    {idx + 1}
                                                </td>
                                                <td className="py-3 px-4 font-mono font-bold text-slate-800 border-r border-slate-100">
                                                    {provRut}
                                                </td>
                                                <td className="py-3 px-4 font-bold text-slate-900 text-xs border-r border-slate-100">
                                                    {provName}
                                                </td>
                                                <td className="py-3 px-4 text-center border-r border-slate-100">
                                                    <span className="font-mono font-bold text-slate-800">
                                                        {dteCount} folios
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900 text-xs border-r border-slate-100">
                                                    {formatCurrency(debtAmount)}
                                                </td>
                                                <td className="py-3 px-4 text-center border-r border-slate-100">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <div className="w-16 bg-slate-200 rounded-full h-1.5 border border-slate-300 overflow-hidden">
                                                            <div
                                                                className="h-1.5 rounded-full bg-blue-800"
                                                                style={{ width: `${Math.min(100, Math.max(5, sharePct))}%` }}
                                                            />
                                                        </div>
                                                        <span className="font-mono text-[11px] font-bold text-slate-700 w-10 text-right">
                                                            {sharePct.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <Link
                                                        href={`/conciliacion`}
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-[11px] rounded transition-colors"
                                                    >
                                                        <span>Conciliar</span>
                                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* RESUMEN MENSUAL Y ACCESOS DEL SISTEMA */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <MonthlyBreakdownGrid data={dashboard.monthly_breakdown} />
                    </div>

                    <div className="space-y-4">
                        <div className="bg-white border border-slate-300 rounded-lg p-4 shadow-sm space-y-3">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">Opciones del Portal Contable</h3>
                            <div className="space-y-2">
                                <Link
                                    href="/conciliacion"
                                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-300 group transition-all"
                                >
                                    <div>
                                        <div className="text-xs font-bold text-slate-900">Módulo Conciliación por RUT</div>
                                        <div className="text-[11px] text-slate-600">Cuadratura en lote de cartolas y facturas</div>
                                    </div>
                                    <ChevronRightIcon className="h-4 w-4 text-slate-500 shrink-0" />
                                </Link>

                                <Link
                                    href="/facturas"
                                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-300 group transition-all"
                                >
                                    <div>
                                        <div className="text-xs font-bold text-slate-900">Registro de Facturas DTE</div>
                                        <div className="text-[11px] text-slate-600">Revisión de DTEs de compra impagos y pagados</div>
                                    </div>
                                    <ChevronRightIcon className="h-4 w-4 text-slate-500 shrink-0" />
                                </Link>

                                <Link
                                    href="/cartolas"
                                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-300 group transition-all"
                                >
                                    <div>
                                        <div className="text-xs font-bold text-slate-900">Cartolas y Movimientos Bancarios</div>
                                        <div className="text-[11px] text-slate-600">Revisión de cargos y abonos bancarios</div>
                                    </div>
                                    <ChevronRightIcon className="h-4 w-4 text-slate-500 shrink-0" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
