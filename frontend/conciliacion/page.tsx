"use client";

import { useState, useEffect, useCallback } from 'react';
import { ArrowPathIcon, CheckCircleIcon, DocumentTextIcon, CurrencyDollarIcon, LinkIcon, CloudArrowDownIcon } from '@heroicons/react/24/outline';
import FilterPanel, { FilterState } from './components/FilterPanel';
import ExportButtons from './components/ExportButtons';

// Interfaces (Mismas que antes)
interface DashboardData {
    period: {
        from: string;
        to: string;
    };
    summary: {
        transactions: {
            total: number;
            matched: number;
            pending: number;
            total_amount: number;
            match_rate: string;
        };
        dtes: {
            total: number;
            paid: number;
            unpaid: number;
            partially_paid: number;
            total_amount: number;
            outstanding_amount: number;
        };
        matches: {
            total: number;
            automatic: number;
            manual: number;
            match_rate: string;
        };
    };
    pending: {
        transactions: any[];
        dtes: any[];
    };
    recent_matches: any[];
    insights: {
        top_providers: any[];
    };
}

export default function ConciliacionPage() {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking');
    const [runMatchLoading, setRunMatchLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showMatches, setShowMatches] = useState(false);
    const [matchFilter, setMatchFilter] = useState('');

    // Filtros iniciales dinámicos
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12

    const [filters, setFilters] = useState<FilterState>({
        year: currentYear,
        months: [currentMonth], // Por defecto mes actual
        status: 'ALL'
    });

    // ...

    // Helper para mostrar texto del periodo
    const getPeriodText = () => {
        if (!filters.year) return 'Periodo: Todos los años';

        let text = `Periodo: ${filters.year}`;

        if (filters.months && filters.months.length > 0) {
            const monthsNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const selectedMonths = filters.months.sort((a, b) => a - b).map(m => monthsNames[m - 1]);

            if (selectedMonths.length === 12) {
                text += ' (Año completo)';
            } else if (selectedMonths.length <= 3) {
                text += ` - ${selectedMonths.join(', ')}`;
            } else {
                text += ` (${selectedMonths.length} meses seleccionados)`;
            }
        } else {
            text += ' (Año completo)';
        }
        return text;
    };

    // API URL con fallback
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://bravium-backend.onrender.com';


    useEffect(() => {
        const fetchDashboard = async () => {
            setLoading(true);
            try {
                const queryParams = new URLSearchParams();
                if (filters.year) queryParams.append('year', filters.year.toString());
                if (filters.months && filters.months.length > 0) {
                    filters.months.forEach(m => queryParams.append('months', m.toString()));
                }

                // Añadir status si aplica
                if (filters.status && filters.status !== 'ALL') queryParams.append('status', filters.status);

                const res = await fetch(`${API_URL}/conciliacion/dashboard?${queryParams.toString()}`);

                if (!res.ok) {
                    // Si falla, verificar si es por backend offline
                    throw new Error(`Error ${res.status}: ${res.statusText}`);
                }

                const data = await res.json();
                setDashboardData(data);
                setBackendStatus('online');
            } catch (err: any) {
                console.error('Error fetching dashboard:', err);
                setError(err.message);
                // Si falla la conexión, podría ser backend offline o red
                if (err.message.includes('fetch') || err.message.includes('connect')) {
                    setBackendStatus('offline');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [refreshTrigger, filters, API_URL]);

    // Helper para obtener rango de fechas según filtros
    const getFilterDateRange = () => {
        const year = filters.year || new Date().getFullYear();
        let fromDate = `${year}-01-01`;
        let toDate = `${year}-12-31`;

        if (filters.months && filters.months.length > 0) {
            const minMonth = Math.min(...filters.months); // 1-12
            const maxMonth = Math.max(...filters.months);

            // Pad month with 0
            const fromM = minMonth.toString().padStart(2, '0');
            const toM = maxMonth.toString().padStart(2, '0');

            // Update dates
            // Last day of maxMonth? (Simple approx: Use 1st of next month - 1 day, or hardcode 31/30/28)
            // Better: new Date(year, month, 0).getDate()
            const lastDay = new Date(year, maxMonth, 0).getDate();

            fromDate = `${year}-${fromM}-01`;
            toDate = `${year}-${toM}-${lastDay}`;
        }
        return { fromDate, toDate };
    };

    const handleAutoMatch = async () => {
        if (!process.env.NEXT_PUBLIC_API_URL && backendStatus === 'offline') {
            alert('El backend no está disponible.');
            return;
        }

        const { fromDate, toDate } = getFilterDateRange();

        setRunMatchLoading(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/run-auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromDate, toDate })
            });

            const data = await res.json();

            if (res.ok) {
                const created = data.data?.matches_created ?? 0;
                alert(`Auto-Match finalizado (${fromDate} a ${toDate}).\n\n✅ Se encontraron ${created} coincidencias nuevas.`);
                setRefreshTrigger(p => p + 1);
            } else {
                alert(`Error al ejecutar Auto-Match: ${data.message || 'Error desconocido'}`);
            }
        } catch (e: any) {
            console.error('Auto-Match error:', e);
            alert(`Error de conexión: ${e.message}`);
        } finally {
            setRunMatchLoading(false);
        }
    };

    // ...

    const handleSyncDtes = async () => {
        const { fromDate, toDate } = getFilterDateRange();
        if (!window.confirm(`¿Deseas sincronizar los DTEs con LibreDTE para el periodo ${fromDate} a ${toDate}?`)) return;

        setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ingestion/libredte/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromDate, toDate })
            });

            const data = await res.json();

            if (res.ok && (data.status === 'success' || data.success)) {
                const count = data.data?.created ?? data.created ?? 0;
                alert(`Sincronización completada.\n\nNuevos DTEs: ${count}\nTotal procesados: ${data.data?.total ?? data.total ?? '?'}`);
                setRefreshTrigger(p => p + 1);
            } else {
                console.error('Sync error:', data);
                alert(`Error en la sincronización: ${data.message || 'Revise logs del servidor'}`);
            }
        } catch (e: any) {
            console.error('Sync failed:', e);
            alert(`Error de conexión: ${e.message}`);
        } finally {
            setSyncing(false);
        }
    };

    if (loading && !dashboardData) {
        return (
            <div className="container-fluid p-4">
                <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
                    <div className="text-center">
                        <div className="spinner-border text-primary mb-3" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                        <p className="text-muted">Conectando al sistema financiero...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!dashboardData) return null;

    // Estilos inline para iconos (CRÍTICO para evitar tamaño gigante)
    const iconStyle = { width: '24px', height: '24px', minWidth: '24px' };
    const largeIconStyle = { width: '48px', height: '48px' };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    return (
        <div className="container-fluid p-4 bg-light min-vh-100">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h1 className="h3 mb-0 fw-bold text-dark">Conciliación Bancaria</h1>
                    <p className="text-muted mb-0">
                        {backendStatus === 'offline'
                            ? <span className="badge bg-warning text-dark">⚠️ Backend desplegándose - Modo Visualización</span>
                            : <span className="badge bg-success">✓ Conectado en tiempo real</span>
                        }
                        <span className="ms-2">{getPeriodText()}</span>
                    </p>
                </div>
                <div className="d-flex gap-2">
                    <button
                        onClick={() => setRefreshTrigger(prev => prev + 1)}
                        className="btn btn-outline-secondary d-flex align-items-center gap-2"
                    >
                        <ArrowPathIcon style={{ width: '16px', height: '16px' }} />
                        Actualizar
                    </button>
                    <button
                        onClick={handleSyncDtes}
                        disabled={syncing || backendStatus === 'offline'}
                        className="btn btn-outline-primary d-flex align-items-center gap-2"
                    >
                        {syncing ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                            <CloudArrowDownIcon style={{ width: '16px', height: '16px' }} />
                        )}
                        Sincronizar DTEs
                    </button>
                    <button
                        onClick={handleAutoMatch}
                        disabled={runMatchLoading || backendStatus === 'offline'}
                        className="btn btn-primary d-flex align-items-center gap-2"
                    >
                        {runMatchLoading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                            <CheckCircleIcon style={{ width: '16px', height: '16px' }} />
                        )}
                        Ejecutar Auto-Match
                    </button>
                </div>
            </div>

            {/* Filtros y Exportación */}
            <FilterPanel
                filters={filters}
                onFiltersChange={setFilters}
                onApply={() => setRefreshTrigger(prev => prev + 1)}
            />

            <div className="d-flex justify-content-end mb-3">
                <ExportButtons filters={filters} apiUrl={API_URL} />
            </div>

            {/* KPI Cards Grid - Rediseñado */}
            <div className="row g-3 mb-4">
                {/* 1. Transacciones Bancarias */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #3b82f6' }}>
                        <div className="card-body p-3">
                            <div className="d-flex align-items-center mb-2">
                                <div className="p-2 rounded-circle" style={{ background: '#eff6ff' }}>
                                    <CurrencyDollarIcon style={{ width: '20px', height: '20px', color: '#3b82f6' }} />
                                </div>
                                <div className="ms-2 flex-grow-1">
                                    <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                                        Movimientos Banco
                                    </div>
                                    <div className="text-dark fw-bold" style={{ fontSize: '24px', lineHeight: '1' }}>
                                        {dashboardData.summary.transactions.total}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-top" style={{ fontSize: '12px' }}>
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-success">✓ Conciliados</span>
                                    <span className="fw-semibold">{dashboardData.summary.transactions.matched}</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-warning">⏳ Por conciliar</span>
                                    <span className="fw-semibold">{dashboardData.summary.transactions.pending}</span>
                                </div>
                            </div>
                            <div className="mt-2 text-center">
                                <small className="text-muted">Tasa de conciliación: <strong>{dashboardData.summary.transactions.match_rate}</strong></small>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Facturas (DTEs) */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #8b5cf6' }}>
                        <div className="card-body p-3">
                            <div className="d-flex align-items-center mb-2">
                                <div className="p-2 rounded-circle" style={{ background: '#f3e8ff' }}>
                                    <DocumentTextIcon style={{ width: '20px', height: '20px', color: '#8b5cf6' }} />
                                </div>
                                <div className="ms-2 flex-grow-1">
                                    <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                                        Facturas Recibidas
                                    </div>
                                    <div className="text-dark fw-bold" style={{ fontSize: '24px', lineHeight: '1' }}>
                                        {dashboardData.summary.dtes.total}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-top" style={{ fontSize: '12px' }}>
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-success">✓ Pagadas</span>
                                    <span className="fw-semibold">{dashboardData.summary.dtes.paid}</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-danger">⚠ Por pagar</span>
                                    <span className="fw-semibold">{dashboardData.summary.dtes.unpaid}</span>
                                </div>
                            </div>
                            <div className="mt-2 text-center">
                                <small className="text-muted">Deuda pendiente: <strong>{formatCurrency(dashboardData.summary.dtes.outstanding_amount)}</strong></small>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Conciliaciones Realizadas */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #22c55e' }}>
                        <div className="card-body p-3">
                            <div className="d-flex align-items-center mb-2">
                                <div className="p-2 rounded-circle" style={{ background: '#f0fdf4' }}>
                                    <LinkIcon style={{ width: '20px', height: '20px', color: '#22c55e' }} />
                                </div>
                                <div className="ms-2 flex-grow-1">
                                    <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                                        Conciliaciones
                                    </div>
                                    <div className="text-dark fw-bold" style={{ fontSize: '24px', lineHeight: '1' }}>
                                        {dashboardData.summary.matches.total}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-top" style={{ fontSize: '12px' }}>
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-primary">🤖 Automáticas</span>
                                    <span className="fw-semibold">{dashboardData.summary.matches.automatic}</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-secondary">👤 Manuales</span>
                                    <span className="fw-semibold">{dashboardData.summary.matches.manual}</span>
                                </div>
                            </div>
                            <div className="mt-2 text-center">
                                <small className="text-muted">Parejas banco ↔ factura confirmadas</small>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Resumen Financiero */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ borderTop: '3px solid #f59e0b' }}>
                        <div className="card-body p-3">
                            <div className="d-flex align-items-center mb-2">
                                <div className="p-2 rounded-circle" style={{ background: '#fffbeb' }}>
                                    <CurrencyDollarIcon style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
                                </div>
                                <div className="ms-2 flex-grow-1">
                                    <div className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                                        Por Pagar
                                    </div>
                                    <div className="text-dark fw-bold" style={{ fontSize: '20px', lineHeight: '1.2' }}>
                                        {formatCurrency(dashboardData.summary.dtes.outstanding_amount)}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-top" style={{ fontSize: '12px' }}>
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-muted">Total facturado</span>
                                    <span className="fw-semibold">{formatCurrency(dashboardData.summary.dtes.total_amount)}</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-muted">Facturas pendientes</span>
                                    <span className="fw-semibold">{dashboardData.summary.dtes.unpaid}</span>
                                </div>
                            </div>
                            <div className="mt-2 text-center">
                                <small className="text-muted">Saldo de facturas sin pagar</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pareos Realizados Section */}
            {dashboardData.recent_matches && dashboardData.recent_matches.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                    <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                        <h5 className="mb-0 fw-bold">
                            <LinkIcon style={{ width: '20px', height: '20px', display: 'inline', marginRight: '8px' }} />
                            Pareos Realizados ({dashboardData.summary.matches.total})
                        </h5>
                        <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setShowMatches(!showMatches)}
                        >
                            {showMatches ? 'Ocultar' : 'Ver Detalles'}
                        </button>
                    </div>

                    {showMatches && (
                        <div className="card-body">
                            {/* Filter */}
                            <div className="mb-3">
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Buscar por descripción, folio, proveedor..."
                                    value={matchFilter}
                                    onChange={(e) => setMatchFilter(e.target.value)}
                                />
                            </div>

                            {/* Matches Table */}
                            <div className="table-responsive">
                                <table className="table table-hover align-middle">
                                    <thead className="table-light">
                                        <tr>
                                            <th>Fecha TX</th>
                                            <th>Descripción</th>
                                            <th>Monto TX</th>
                                            <th>Folio DTE</th>
                                            <th>Proveedor</th>
                                            <th>Monto DTE</th>
                                            <th>Tipo</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dashboardData.recent_matches
                                            .filter((match) => {
                                                if (!matchFilter) return true;
                                                const searchLower = matchFilter.toLowerCase();
                                                return (
                                                    match.transaction?.description?.toLowerCase().includes(searchLower) ||
                                                    match.dte?.folio?.toString().includes(searchLower) ||
                                                    match.dte?.provider?.name?.toLowerCase().includes(searchLower)
                                                );
                                            })
                                            .map((match, idx) => (
                                                <tr key={idx}>
                                                    <td className="text-nowrap">
                                                        {match.transaction?.date ? new Date(match.transaction.date).toLocaleDateString('es-CL') : 'N/A'}
                                                    </td>
                                                    <td>
                                                        <div className="text-truncate" style={{ maxWidth: '200px' }}>
                                                            {match.transaction?.description || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td className="text-end">
                                                        <span className="text-danger fw-bold">
                                                            {formatCurrency(Math.abs(match.transaction?.amount || 0))}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="badge bg-secondary">
                                                            #{match.dte?.folio || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="text-truncate" style={{ maxWidth: '150px' }}>
                                                            {match.dte?.provider?.name || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td className="text-end">
                                                        <span className="fw-bold">
                                                            {formatCurrency(match.dte?.totalAmount || 0)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${match.matchType === 'AUTOMATIC' ? 'bg-success' : 'bg-info'}`}>
                                                            {match.matchType === 'AUTOMATIC' ? 'Auto' : 'Manual'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${match.status === 'CONFIRMED' ? 'bg-success' : 'bg-warning'}`}>
                                                            {match.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* No results message */}
                            {dashboardData.recent_matches.filter((match) => {
                                if (!matchFilter) return true;
                                const searchLower = matchFilter.toLowerCase();
                                return (
                                    match.transaction?.description?.toLowerCase().includes(searchLower) ||
                                    match.dte?.folio?.toString().includes(searchLower) ||
                                    match.dte?.provider?.name?.toLowerCase().includes(searchLower)
                                );
                            }).length === 0 && (
                                    <div className="text-center text-muted py-4">
                                        No se encontraron pareos que coincidan con "{matchFilter}"
                                    </div>
                                )}
                        </div>
                    )}
                </div>
            )}

            {/* Empty State / Status Message */}
            {
                dashboardData.pending.transactions.length === 0 && dashboardData.pending.dtes.length === 0 && (
                    <div className="card border-primary border-opacity-25 bg-primary bg-opacity-10 mb-4 text-center p-5">
                        <div className="card-body">
                            <div className="bg-white rounded-circle d-inline-flex p-3 mb-3 shadow-sm">
                                <DocumentTextIcon style={largeIconStyle} className="text-primary" />
                            </div>
                            <h4 className="card-title text-primary fw-bold">
                                {backendStatus === 'offline' ? 'Backend Desplegándose' : 'Sistema al Día'}
                            </h4>
                            <p className="card-text text-dark">
                                {backendStatus === 'offline'
                                    ? 'El backend está inicializando. Los datos aparecerán automáticamente en breve.'
                                    : dashboardData.summary.transactions.total > 0
                                        ? '¡Excelente! No tienes movimientos pendientes de revisión.'
                                        : 'No se detectaron cartolas bancarias para este período.'}
                            </p>

                            {dashboardData.summary.transactions.total === 0 && (
                                <div className="alert alert-warning d-inline-block mt-2">
                                    <small>⚠️ Sugerencia: Carga la cartola del banco en la sección "Cargar Cartola"</small>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            <div className="row g-4">
                {/* Tabla Pendientes Banco */}
                <div className="col-12 col-xl-6">
                    <div className="card border-0 shadow-sm h-100">
                        <div className="card-header bg-white border-bottom py-3">
                            <h5 className="mb-0 fw-bold">🏦 Transacciones Pendientes</h5>
                        </div>
                        <div className="card-body p-0">
                            {dashboardData.pending.transactions.length > 0 ? (
                                <div className="table-responsive">
                                    <table className="table table-hover mb-0 align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Fecha</th>
                                                <th>Descripción</th>
                                                <th className="text-end">Monto</th>
                                                <th>Ref</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dashboardData.pending.transactions.map((tx: any) => (
                                                <tr key={tx.id}>
                                                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                                                    <td className="small text-truncate" style={{ maxWidth: '200px' }} title={tx.description}>
                                                        {tx.description}
                                                    </td>
                                                    <td className={`text-end fw-bold ${tx.amount < 0 ? 'text-danger' : 'text-success'}`}>
                                                        {formatCurrency(tx.amount)}
                                                    </td>
                                                    <td>
                                                        <button className="btn btn-sm btn-outline-primary py-0">Link</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-4 text-center text-muted">
                                    <CheckCircleIcon className="mx-auto text-success mb-2" style={largeIconStyle} />
                                    <p>No hay transacciones pendientes</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabla Pendientes DTEs */}
                <div className="col-12 col-xl-6">
                    <div className="card border-0 shadow-sm h-100">
                        <div className="card-header bg-white border-bottom py-3">
                            <h5 className="mb-0 fw-bold">📄 DTEs por Pagar</h5>
                        </div>
                        <div className="card-body p-0">
                            {dashboardData.pending.dtes.length > 0 ? (
                                <div className="table-responsive">
                                    <table className="table table-hover mb-0 align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th>Folio</th>
                                                <th>Proveedor</th>
                                                <th>Emisión</th>
                                                <th className="text-end">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dashboardData.pending.dtes.map((dte: any) => (
                                                <tr key={dte.id}>
                                                    <td>
                                                        <span className="badge bg-secondary">{dte.type || 33}</span> #{dte.folio}
                                                    </td>
                                                    <td className="small text-truncate" style={{ maxWidth: '150px' }}>
                                                        {dte.provider?.name || 'Desconocido'}
                                                    </td>
                                                    <td>{new Date(dte.issuedDate).toLocaleDateString()}</td>
                                                    <td className="text-end fw-bold text-danger">
                                                        {formatCurrency(dte.outstandingAmount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-4 text-center text-muted">
                                    <CheckCircleIcon className="mx-auto text-success mb-2" style={largeIconStyle} />
                                    <p>Todas las facturas están pagadas</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
