"use client";

import { useState } from 'react';
import { FunnelIcon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

export interface FilterState {
    year?: number;
    months?: number[];
    providerIds?: string[];
    fromDate?: string;
    toDate?: string;
    status?: 'ALL' | 'PENDING' | 'MATCHED' | 'CONFIRMED';
    minAmount?: number;
    maxAmount?: number;
}

interface FilterPanelProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onApply: () => void;
}

const MONTHS = [
    { value: 1, label: 'Ene', fullLabel: 'Enero' },
    { value: 2, label: 'Feb', fullLabel: 'Febrero' },
    { value: 3, label: 'Mar', fullLabel: 'Marzo' },
    { value: 4, label: 'Abr', fullLabel: 'Abril' },
    { value: 5, label: 'May', fullLabel: 'Mayo' },
    { value: 6, label: 'Jun', fullLabel: 'Junio' },
    { value: 7, label: 'Jul', fullLabel: 'Julio' },
    { value: 8, label: 'Ago', fullLabel: 'Agosto' },
    { value: 9, label: 'Sep', fullLabel: 'Septiembre' },
    { value: 10, label: 'Oct', fullLabel: 'Octubre' },
    { value: 11, label: 'Nov', fullLabel: 'Noviembre' },
    { value: 12, label: 'Dic', fullLabel: 'Diciembre' },
];

const YEARS = [2024, 2025, 2026];

export default function FilterPanel({ filters, onFiltersChange, onApply }: FilterPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleYearChange = (year: number) => {
        onFiltersChange({ ...filters, year });
    };

    const handleMonthToggle = (month: number) => {
        const currentMonths = filters.months || [];
        const newMonths = currentMonths.includes(month)
            ? currentMonths.filter(m => m !== month)
            : [...currentMonths, month].sort((a, b) => a - b);

        onFiltersChange({ ...filters, months: newMonths.length > 0 ? newMonths : undefined });
    };

    const handleStatusChange = (status: string) => {
        onFiltersChange({ ...filters, status: status as any });
    };

    const handleClearFilters = () => {
        onFiltersChange({
            year: 2025,
            status: 'ALL'
        });
        onApply();
    };

    const activeFilterCount = [
        filters.year && filters.year !== 2025,
        filters.months && filters.months.length > 0,
        filters.status && filters.status !== 'ALL',
        filters.minAmount,
        filters.maxAmount,
    ].filter(Boolean).length;

    const getFilterSummary = () => {
        const parts = [];
        if (filters.year) parts.push(`${filters.year}`);
        if (filters.months && filters.months.length > 0) {
            if (filters.months.length === 12) {
                parts.push('Todos los meses');
            } else if (filters.months.length <= 3) {
                parts.push(filters.months.map(m => MONTHS.find(mo => mo.value === m)?.label).join(', '));
            } else {
                parts.push(`${filters.months.length} meses`);
            }
        }
        if (filters.status && filters.status !== 'ALL') {
            const statusLabels = { PENDING: 'Pendientes', MATCHED: 'Conciliados', CONFIRMED: 'Confirmados' };
            parts.push(statusLabels[filters.status] || filters.status);
        }
        return parts.length > 0 ? parts.join(' • ') : 'Sin filtros aplicados';
    };

    return (
        <div className="card border-0 shadow-sm mb-3" style={{ background: '#f8f9fa' }}>
            {/* Header Compacto */}
            <div
                className="card-body py-2 px-3"
                style={{ cursor: 'pointer' }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        <FunnelIcon style={{ width: '18px', height: '18px', color: '#6c757d' }} />
                        <span className="fw-semibold text-dark" style={{ fontSize: '14px' }}>Filtros</span>
                        {activeFilterCount > 0 && (
                            <span className="badge bg-primary" style={{ fontSize: '11px' }}>{activeFilterCount}</span>
                        )}
                        <span className="text-muted" style={{ fontSize: '12px' }}>• {getFilterSummary()}</span>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                        {activeFilterCount > 0 && !isExpanded && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleClearFilters(); }}
                                className="btn btn-sm btn-link text-decoration-none p-0"
                                style={{ fontSize: '12px' }}
                            >
                                Limpiar
                            </button>
                        )}
                        <ChevronDownIcon
                            style={{
                                width: '16px',
                                height: '16px',
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Panel Expandible */}
            {isExpanded && (
                <div className="card-body pt-0 px-3 pb-3">
                    <div className="row g-2">
                        {/* Año y Estado en una fila */}
                        <div className="col-6 col-md-3">
                            <label className="form-label mb-1" style={{ fontSize: '12px', fontWeight: 600 }}>Año</label>
                            <select
                                className="form-select form-select-sm"
                                value={filters.year || 2025}
                                onChange={(e) => handleYearChange(Number(e.target.value))}
                            >
                                {YEARS.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>

                        <div className="col-6 col-md-3">
                            <label className="form-label mb-1" style={{ fontSize: '12px', fontWeight: 600 }}>Estado</label>
                            <select
                                className="form-select form-select-sm"
                                value={filters.status || 'ALL'}
                                onChange={(e) => handleStatusChange(e.target.value)}
                            >
                                <option value="ALL">Todos</option>
                                <option value="PENDING">Pendientes</option>
                                <option value="MATCHED">Conciliados</option>
                                <option value="CONFIRMED">Confirmados</option>
                            </select>
                        </div>

                        {/* Montos */}
                        <div className="col-6 col-md-3">
                            <label className="form-label mb-1" style={{ fontSize: '12px', fontWeight: 600 }}>Monto Mín</label>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                placeholder="0"
                                value={filters.minAmount || ''}
                                onChange={(e) => onFiltersChange({
                                    ...filters,
                                    minAmount: e.target.value ? Number(e.target.value) : undefined
                                })}
                            />
                        </div>

                        <div className="col-6 col-md-3">
                            <label className="form-label mb-1" style={{ fontSize: '12px', fontWeight: 600 }}>Monto Máx</label>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                placeholder="Sin límite"
                                value={filters.maxAmount || ''}
                                onChange={(e) => onFiltersChange({
                                    ...filters,
                                    maxAmount: e.target.value ? Number(e.target.value) : undefined
                                })}
                            />
                        </div>

                        {/* Meses - Compacto */}
                        <div className="col-12">
                            <label className="form-label mb-1" style={{ fontSize: '12px', fontWeight: 600 }}>Meses</label>
                            <div className="d-flex flex-wrap gap-1">
                                {MONTHS.map(month => {
                                    const isSelected = filters.months?.includes(month.value);
                                    return (
                                        <button
                                            key={month.value}
                                            onClick={() => handleMonthToggle(month.value)}
                                            className={`btn ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                                            style={{
                                                fontSize: '11px',
                                                padding: '4px 10px',
                                                minWidth: '45px'
                                            }}
                                            title={month.fullLabel}
                                        >
                                            {month.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Botones de acción */}
                        <div className="col-12 d-flex gap-2 mt-2">
                            <button
                                onClick={onApply}
                                className="btn btn-primary btn-sm flex-grow-1"
                                style={{ fontSize: '13px' }}
                            >
                                Aplicar Filtros
                            </button>
                            {activeFilterCount > 0 && (
                                <button
                                    onClick={handleClearFilters}
                                    className="btn btn-outline-secondary btn-sm"
                                    style={{ fontSize: '13px' }}
                                >
                                    <XMarkIcon style={{ width: '14px', height: '14px' }} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
