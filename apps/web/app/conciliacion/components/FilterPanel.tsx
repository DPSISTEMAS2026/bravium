"use client";

import { useState } from 'react';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

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
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
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
        filters.fromDate,
        filters.toDate,
    ].filter(Boolean).length;

    return (
        <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white border-bottom py-3">
                <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        <FunnelIcon style={{ width: '20px', height: '20px' }} />
                        <h5 className="mb-0 fw-bold">Filtros</h5>
                        {activeFilterCount > 0 && (
                            <span className="badge bg-primary">{activeFilterCount}</span>
                        )}
                    </div>
                    <div className="d-flex gap-2">
                        {activeFilterCount > 0 && (
                            <button
                                onClick={handleClearFilters}
                                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                            >
                                <XMarkIcon style={{ width: '16px', height: '16px' }} />
                                Limpiar
                            </button>
                        )}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="btn btn-sm btn-outline-primary"
                        >
                            {isExpanded ? 'Ocultar' : 'Mostrar'}
                        </button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="card-body">
                    <div className="row g-3">
                        {/* Año */}
                        <div className="col-12 col-md-6 col-lg-3">
                            <label className="form-label small fw-bold">Año</label>
                            <select
                                className="form-select"
                                value={filters.year || 2025}
                                onChange={(e) => handleYearChange(Number(e.target.value))}
                            >
                                {YEARS.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>

                        {/* Estado */}
                        <div className="col-12 col-md-6 col-lg-3">
                            <label className="form-label small fw-bold">Estado</label>
                            <select
                                className="form-select"
                                value={filters.status || 'ALL'}
                                onChange={(e) => handleStatusChange(e.target.value)}
                            >
                                <option value="ALL">Todos</option>
                                <option value="PENDING">Pendientes</option>
                                <option value="MATCHED">Conciliados</option>
                                <option value="CONFIRMED">Confirmados</option>
                            </select>
                        </div>

                        {/* Monto Mínimo */}
                        <div className="col-12 col-md-6 col-lg-3">
                            <label className="form-label small fw-bold">Monto Mínimo</label>
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Ej: 1000000"
                                value={filters.minAmount || ''}
                                onChange={(e) => onFiltersChange({
                                    ...filters,
                                    minAmount: e.target.value ? Number(e.target.value) : undefined
                                })}
                            />
                        </div>

                        {/* Monto Máximo */}
                        <div className="col-12 col-md-6 col-lg-3">
                            <label className="form-label small fw-bold">Monto Máximo</label>
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Ej: 10000000"
                                value={filters.maxAmount || ''}
                                onChange={(e) => onFiltersChange({
                                    ...filters,
                                    maxAmount: e.target.value ? Number(e.target.value) : undefined
                                })}
                            />
                        </div>

                        {/* Meses */}
                        <div className="col-12">
                            <label className="form-label small fw-bold">Meses</label>
                            <div className="d-flex flex-wrap gap-2">
                                {MONTHS.map(month => {
                                    const isSelected = filters.months?.includes(month.value);
                                    return (
                                        <button
                                            key={month.value}
                                            onClick={() => handleMonthToggle(month.value)}
                                            className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                                        >
                                            {month.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {filters.months && filters.months.length > 0 && (
                                <small className="text-muted d-block mt-2">
                                    Seleccionados: {filters.months.map(m => MONTHS.find(mo => mo.value === m)?.label).join(', ')}
                                </small>
                            )}
                        </div>

                        {/* Botón Aplicar */}
                        <div className="col-12">
                            <button
                                onClick={onApply}
                                className="btn btn-primary w-100"
                            >
                                Aplicar Filtros
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
