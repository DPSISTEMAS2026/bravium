'use client';

import { useState, useEffect } from 'react';
import {
    MagnifyingGlassIcon,
    FunnelIcon,
    ChartBarIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface Provider {
    id: string;
    rut: string;
    name: string;
    category: string | null;
    totalDebt: number;
    totalInvoiced: number;
    paidAmount: number;
    paymentRate: string;
    invoiceCount: number;
    unpaidInvoices: number;
    overdueInvoices: number;
    status: 'CRITICAL' | 'WARNING' | 'OK';
}

export default function ProveedoresPage() {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    useEffect(() => {
        loadProviders();
    }, []);

    const loadProviders = async () => {
        try {
            setLoading(true);
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${API_URL}/proveedores`);
            const data = await response.json();
            setProviders(data);
        } catch (error) {
            console.error('Error loading providers:', error);
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

    const filteredProviders = providers.filter((p) => {
        const matchesSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.rut.toLowerCase().includes(search.toLowerCase());

        const matchesStatus =
            statusFilter === 'ALL' ||
            (statusFilter === 'CRITICAL' && p.status === 'CRITICAL') ||
            (statusFilter === 'WARNING' && p.status === 'WARNING') ||
            (statusFilter === 'OK' && p.status === 'OK');

        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: providers.length,
        conDeuda: providers.filter((p) => p.totalDebt > 0).length,
        deudaTotal: providers.reduce((sum, p) => sum + p.totalDebt, 0),
        critical: providers.filter((p) => p.status === 'CRITICAL').length,
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">Cargando proveedores...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Proveedores</h1>
                    <p className="text-slate-600 mt-1">
                        Gestión de saldos y deuda histórica
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card p-5 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                    <div className="text-3xl font-bold text-blue-900 mb-1">
                        {stats.total}
                    </div>
                    <div className="text-sm text-blue-700 font-medium">
                        Proveedores Totales
                    </div>
                </div>

                <div className="card p-5 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                    <div className="text-3xl font-bold text-purple-900 mb-1">
                        {stats.conDeuda}
                    </div>
                    <div className="text-sm text-purple-700 font-medium">
                        Con Deuda Pendiente
                    </div>
                </div>

                <div className="card p-5 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200">
                    <div className="text-2xl font-bold text-amber-900 mb-1">
                        {formatCurrency(stats.deudaTotal)}
                    </div>
                    <div className="text-sm text-amber-700 font-medium">
                        Deuda Total
                    </div>
                </div>

                <div className="card p-5 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                    <div className="text-3xl font-bold text-red-900 mb-1">
                        {stats.critical}
                    </div>
                    <div className="text-sm text-red-700 font-medium">
                        Estado Crítico
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o RUT..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <FunnelIcon className="h-5 w-5 text-slate-400" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium"
                        >
                            <option value="ALL">Todos los estados</option>
                            <option value="CRITICAL">Crítico</option>
                            <option value="WARNING">Advertencia</option>
                            <option value="OK">Al día</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 font-semibold border-b-2 border-slate-200">
                            <tr>
                                <th className="px-6 py-4">Proveedor / RUT</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4 text-right">Facturado</th>
                                <th className="px-6 py-4 text-right">Pagado</th>
                                <th className="px-6 py-4 text-right">Deuda</th>
                                <th className="px-6 py-4 text-center">Facturas</th>
                                <th className="px-6 py-4 text-center">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredProviders.map((provider) => (
                                <tr
                                    key={provider.id}
                                    className="hover:bg-blue-50/50 transition-colors duration-150"
                                >
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-900">
                                            {provider.name}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">
                                            {provider.rut}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {provider.category ? (
                                            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                                {provider.category}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">
                                                Sin categoría
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-slate-700">
                                        {formatCurrency(provider.totalInvoiced)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-green-700 font-semibold">
                                            {formatCurrency(provider.paidAmount)}
                                        </span>
                                        <div className="text-xs text-slate-500">
                                            {provider.paymentRate}% pagado
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span
                                            className={`font-bold ${provider.totalDebt > 0
                                                ? 'text-red-600'
                                                : 'text-slate-400'
                                                }`}
                                        >
                                            {formatCurrency(provider.totalDebt)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="text-slate-900 font-medium">
                                            {provider.invoiceCount}
                                        </div>
                                        {provider.unpaidInvoices > 0 && (
                                            <div className="text-xs text-amber-600">
                                                {provider.unpaidInvoices} pendientes
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {provider.status === 'CRITICAL' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                                                <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                                                Crítico
                                            </span>
                                        )}
                                        {provider.status === 'WARNING' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
                                                <ClockIcon className="h-4 w-4 mr-1" />
                                                Pendiente
                                            </span>
                                        )}
                                        {provider.status === 'OK' && (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                                Al Día
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={`/proveedores/${provider.id}`}
                                            className="text-blue-600 font-semibold hover:text-blue-800 hover:underline transition-colors"
                                        >
                                            Ver Detalle
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredProviders.length === 0 && (
                    <div className="text-center py-12">
                        <ChartBarIcon className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">
                            No se encontraron proveedores
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                            Intenta ajustar los filtros de búsqueda
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
