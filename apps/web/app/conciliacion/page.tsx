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

    // Filtros
    const [filters, setFilters] = useState<FilterState>({
        year: 2025,
        status: 'ALL'
    });

    // API URL con fallback
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://bravium-backend.onrender.com';


    // ... (existing code)

    const handleAutoMatch = async () => {
        if (!process.env.NEXT_PUBLIC_API_URL && backendStatus === 'offline') {
            alert('El backend no está disponible.');
            return;
        }

        setRunMatchLoading(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/run-auto-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate: '2026-01-01',
                    toDate: '2026-01-31'
                })
            });

            const data = await res.json();

            if (res.ok) {
                const created = data.data?.matches_created ?? 0;
                alert(`Auto-Match finalizado.\n\n✅ Se encontraron ${created} coincidencias nuevas.`);
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

    // ... (renders)


    const EMPTY_DATA: DashboardData = {
        period: { from: '', to: '' },
        summary: {
            transactions: { total: 0, matched: 0, pending: 0, total_amount: 0, match_rate: '0%' },
            dtes: { total: 0, paid: 0, unpaid: 0, partially_paid: 0, total_amount: 0, outstanding_amount: 0 },
            matches: { total: 0, automatic: 0, manual: 0, match_rate: '0%' }
        },
        pending: { transactions: [], dtes: [] },
        recent_matches: [],
        insights: { top_providers: [] }
    };

    // Health Check Logic
    const checkBackendHealth = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/conciliacion/overview`);
            if (res.ok) {
                setBackendStatus('online');
                return true;
            }
            return false;
        } catch (e) {
            setBackendStatus('offline');
            return false;
        }
    }, [API_URL]);

    // Main Fetch Logic
    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            if (!isMounted) return;
            setLoading(true);

            // 1. Check Health
            const isHealthy = await checkBackendHealth();

            if (!isHealthy) {
                if (isMounted) {
                    console.warn('Backend offline o inaccesible. Mostrando estado vacío.');
                    // Usamos EMPTY_DATA para no mostrar números falsos
                    setDashboardData(EMPTY_DATA);
                    setBackendStatus('offline');
                    setLoading(false);
                    // Reintentar conexión en 30s
                    setTimeout(() => setRefreshTrigger(prev => prev + 1), 30000);
                }
                return;
            }

            // 2. Fetch Dashboard Real con Filtros
            try {
                // Construir query params desde filtros
                const params = new URLSearchParams();
                if (filters.year) params.append('year', filters.year.toString());
                if (filters.months && filters.months.length > 0) {
                    params.append('months', filters.months.join(','));
                }
                if (filters.status && filters.status !== 'ALL') {
                    params.append('status', filters.status);
                }
                if (filters.minAmount) params.append('minAmount', filters.minAmount.toString());
                if (filters.maxAmount) params.append('maxAmount', filters.maxAmount.toString());
                if (filters.fromDate) params.append('fromDate', filters.fromDate);
                if (filters.toDate) params.append('toDate', filters.toDate);

                const res = await fetch(`${API_URL}/conciliacion/dashboard?${params.toString()}`);

                if (!res.ok) {
                    throw new Error(`Error ${res.status}: ${res.statusText}`);
                }

                const data = await res.json();
                if (isMounted) {
                    setDashboardData(data);
                    setBackendStatus('online'); // Confirmamos conexión exitosa
                    setError(null);
                }
            } catch (err: any) {
                console.error('Error fetching dashboard:', err);
                if (isMounted) {
                    // Si falla la carga de datos, mostramos vacío, no inventado
                    setDashboardData(EMPTY_DATA);
                    setBackendStatus('offline');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => { isMounted = false; };
    }, [refreshTrigger, checkBackendHealth, API_URL]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    const handleSyncDtes = async () => {
        if (!window.confirm('¿Deseas sincronizar los DTEs con LibreDTE para Enero 2026?')) return;

        setSyncing(true);
        try {
            const res = await fetch(`${API_URL}/ingestion/libredte/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate: '2026-01-01',
                    toDate: '2026-01-31'
                })
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
                        <span className="ms-2">Periodo: Enero 2026</span>
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

            {/* KPI Cards Grid - Bootstrap */}
            <div className="row g-4 mb-4">
                {/* 1. Transacciones (Azul) */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(to bottom right, #eff6ff, #dbeafe)', borderLeft: '4px solid #3b82f6' }}>
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                                <div className="p-2 rounded bg-white text-primary">
                                    <CurrencyDollarIcon style={iconStyle} />
                                </div>
                                <span className="badge bg-primary bg-opacity-10 text-primary">
                                    Tasa: {dashboardData.summary.transactions.match_rate}
                                </span>
                            </div>
                            <h3 className="fw-bold text-dark mb-1">{dashboardData.summary.transactions.total}</h3>
                            <div className="text-muted small mb-2">Transacciones Bancarias</div>
                            <div className="small text-secondary">
                                <div>✅ Conciliado: {dashboardData.summary.transactions.matched}</div>
                                <div>⏳ Pendiente: {dashboardData.summary.transactions.pending}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. DTEs (Púrpura) */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(to bottom right, #f3e8ff, #ede9fe)', borderLeft: '4px solid #8b5cf6' }}>
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                                <div className="p-2 rounded bg-white text-purple" style={{ color: '#6d28d9' }}>
                                    <DocumentTextIcon style={iconStyle} />
                                </div>
                                <span className="badge bg-success">
                                    {dashboardData.summary.dtes.total} Total
                                </span>
                            </div>
                            <h3 className="fw-bold text-dark mb-1">{dashboardData.summary.dtes.unpaid}</h3>
                            <div className="text-muted small mb-2">Facturas por Pagar</div>
                            <div className="small text-secondary">
                                <div>💰 Pagado: {dashboardData.summary.dtes.paid}</div>
                                <div>⚠️ Pendiente: {dashboardData.summary.dtes.unpaid}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Matches (Verde) */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7)', borderLeft: '4px solid #22c55e' }}>
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                                <div className="p-2 rounded bg-white text-success">
                                    <LinkIcon style={iconStyle} />
                                </div>
                                <span className="badge bg-success bg-opacity-10 text-success">
                                    Confirmados
                                </span>
                            </div>
                            <h3 className="fw-bold text-dark mb-1">{dashboardData.summary.matches.total}</h3>
                            <div className="text-muted small mb-2">Pareos Realizados</div>
                            <div className="small text-secondary">
                                <div>🤖 Auto: {dashboardData.summary.matches.automatic}</div>
                                <div>👤 Manual: {dashboardData.summary.matches.manual}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Pendiente (Ámbar) */}
                <div className="col-12 col-md-6 col-xl-3">
                    <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(to bottom right, #fffbeb, #fef3c7)', borderLeft: '4px solid #f59e0b' }}>
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                                <div className="p-2 rounded bg-white text-warning" style={{ color: '#d97706' }}>
                                    {/* ICONO CORREGIDO - Sin Emoji Gigante */}
                                    <CurrencyDollarIcon style={iconStyle} />
                                </div>
                                <span className="badge bg-warning bg-opacity-25 text-dark">
                                    Deuda Flotante
                                </span>
                            </div>
                            <h3 className="fw-bold text-dark mb-1" style={{ fontSize: '1.25rem' }}>
                                {formatCurrency(dashboardData.summary.dtes.outstanding_amount)}
                            </h3>
                            <div className="text-muted small">Monto por Pagar</div>
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
