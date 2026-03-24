'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
    ChartBarIcon,
    ArrowDownTrayIcon,
    CurrencyDollarIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '@/lib/api';

interface DeudaProveedor {
    provider: {
        id: string;
        rut: string;
        name: string;
    };
    totalInvoiced: number;
    totalOutstanding: number;
    paidAmount: number;
    paymentRate: number;
    invoiceCount: number;
    unpaidCount: number;
}

interface FlujoCajaMonth {
    month: string;
    inflows: number;
    outflows: number;
    netFlow: number;
    transactionCount: number;
    matchRate: number;
}

export default function ReportesPage() {
    const API_URL = getApiUrl();

    const [fromDate, setFromDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    const { data: deudaData, isLoading: deudaLoading } = useSWR(
        `${API_URL}/reportes/deuda-proveedores?fromDate=${fromDate}&toDate=${toDate}`
    );
    const { data: flujoData, isLoading: flujoLoading } = useSWR(
        `${API_URL}/reportes/flujo-caja?fromDate=${fromDate}&toDate=${toDate}`
    );

    const deudaProveedores: DeudaProveedor[] = deudaData?.providers || [];
    const flujoCaja: FlujoCajaMonth[] = flujoData?.monthly || [];
    const loading = deudaLoading || flujoLoading;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const exportToExcel = async () => {
        try {
            const response = await fetch(
                `${getApiUrl()}/conciliacion/export/excel?type=all`
            );

            if (!response.ok) throw new Error('Error al exportar');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte_conciliacion_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Error al exportar a Excel');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <ArrowPathIcon className="h-12 w-12 text-indigo-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600 font-medium tracking-tight uppercase text-xs">Generando Reportes...</p>
                </div>
            </div>
        );
    }

    const totalDeuda = deudaProveedores.reduce((sum, p) => sum + p.totalOutstanding, 0);
    const totalFacturado = deudaProveedores.reduce((sum, p) => sum + p.totalInvoiced, 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">
                        Reportes e Inteligencia
                    </h1>
                    <p className="text-slate-600 mt-1">
                        Análisis y exportación de datos mediante filtros de fecha personalizados
                    </p>
                </div>
                <button
                    onClick={exportToExcel}
                    className="btn-primary flex items-center space-x-2"
                >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                    <span>Exportar a Excel</span>
                </button>
            </div>
            {/* Filters Bar */}
            <div className="card p-4 flex flex-col md:flex-row gap-4 items-end bg-white shadow-sm">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">Desde</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">Hasta</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white"
                    />
                </div>
                <div className="flex-1"></div>
                <div className="text-xs text-slate-400 italic">Los reportes se actualizarán al cambiar de fecha.</div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-blue-200 rounded-xl">
                            <ChartBarIcon className="h-8 w-8 text-blue-700" />
                        </div>
                        <div className="flex-1">
                            <div className="text-2xl font-bold text-blue-900">
                                {deudaProveedores.length}
                            </div>
                            <div className="text-sm text-blue-700 font-medium">
                                Proveedores Activos
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-purple-200 rounded-xl">
                            <CurrencyDollarIcon className="h-8 w-8 text-purple-700" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xl font-bold text-purple-900">
                                {formatCurrency(totalFacturado)}
                            </div>
                            <div className="text-sm text-purple-700 font-medium">
                                Total Facturado
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card p-6 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                    <div className="flex items-center space-x-4">
                        <div className="p-3 bg-red-200 rounded-xl">
                            <ExclamationTriangleIcon className="h-8 w-8 text-red-700" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xl font-bold text-red-900">
                                {formatCurrency(totalDeuda)}
                            </div>
                            <div className="text-sm text-red-700 font-medium">
                                Deuda Total
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Deuda por Proveedor */}
            <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
                    <h2 className="text-xl font-bold text-slate-900">
                        Deuda por Proveedor
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                        Top proveedores ordenados por deuda pendiente
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-700 font-semibold">
                            <tr>
                                <th className="px-6 py-3 text-left">#</th>
                                <th className="px-6 py-3 text-left">Proveedor</th>
                                <th className="px-6 py-3 text-right">Facturado</th>
                                <th className="px-6 py-3 text-right">Pagado</th>
                                <th className="px-6 py-3 text-right">Deuda</th>
                                <th className="px-6 py-3 text-center">Tasa Pago</th>
                                <th className="px-6 py-3 text-center">Facturas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {deudaProveedores.slice(0, 20).map((item, idx) => {
                                const rate = item.paymentRate;
                                const barColor =
                                    rate < 30
                                        ? 'from-red-500 to-red-600'
                                        : rate < 70
                                        ? 'from-amber-400 to-orange-500'
                                        : 'from-green-500 to-emerald-600';
                                const rateTextColor =
                                    rate < 30
                                        ? 'text-red-600'
                                        : rate < 70
                                        ? 'text-amber-600'
                                        : 'text-emerald-600';
                                const facturasUrl = `/facturas?search=${encodeURIComponent(item.provider.rut)}&status=UNPAID`;
                                return (
                                    <tr
                                        key={item.provider.id}
                                        className="hover:bg-slate-50 transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                                {idx + 1}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Link
                                                href={`/proveedores/${item.provider.id}`}
                                                className="group flex items-center gap-1"
                                            >
                                                <span className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                    {item.provider.name}
                                                </span>
                                                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-all" />
                                            </Link>
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                                                {item.provider.rut}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-700">
                                            {formatCurrency(item.totalInvoiced)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-green-700 font-semibold">
                                            {formatCurrency(item.paidAmount)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-bold text-red-600 text-lg">
                                                {formatCurrency(item.totalOutstanding)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center">
                                                <div className="w-24 bg-slate-200 rounded-full h-2 mr-2">
                                                    <div
                                                        className={`bg-gradient-to-r ${barColor} h-2 rounded-full transition-all duration-500`}
                                                        style={{ width: `${rate}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-bold ${rateTextColor}`}>
                                                    {rate.toFixed(0)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="text-slate-900 font-medium">
                                                {item.invoiceCount}
                                            </div>
                                            {item.unpaidCount > 0 && (
                                                <Link
                                                    href={facturasUrl}
                                                    className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-full text-xs font-semibold transition-colors"
                                                >
                                                    {item.unpaidCount} pendientes
                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Flujo de Caja */}
            <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100">
                    <h2 className="text-xl font-bold text-slate-900">
                        Flujo de Caja Mensual
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                        Análisis de ingresos y egresos por mes
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-700 font-semibold">
                            <tr>
                                <th className="px-6 py-3 text-left">Mes</th>
                                <th className="px-6 py-3 text-right">Ingresos</th>
                                <th className="px-6 py-3 text-right">Egresos</th>
                                <th className="px-6 py-3 text-right">Flujo Neto</th>
                                <th className="px-6 py-3 text-center">Transacciones</th>
                                <th className="px-6 py-3 text-center">Tasa Match</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {flujoCaja.map((month) => (
                                <tr
                                    key={month.month}
                                    className="hover:bg-slate-50 transition-colors"
                                >
                                    <td className="px-6 py-4 font-semibold text-slate-900">
                                        {new Date(month.month + '-01').toLocaleDateString(
                                            'es-CL',
                                            { year: 'numeric', month: 'long' }
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right text-green-700 font-bold">
                                        {formatCurrency(month.inflows)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-red-700 font-bold">
                                        {formatCurrency(month.outflows)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span
                                            className={`font-bold text-lg ${month.netFlow >= 0
                                                ? 'text-emerald-600'
                                                : 'text-amber-600'
                                                }`}
                                        >
                                            {month.netFlow >= 0 ? '+' : ''}
                                            {formatCurrency(month.netFlow)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-slate-700">
                                        {month.transactionCount}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                            {month.matchRate.toFixed(0)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
