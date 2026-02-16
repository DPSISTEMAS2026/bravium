"use client";

import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import type { FilterState } from './FilterPanel';

interface ExportButtonsProps {
    filters: FilterState;
    apiUrl: string;
}

export default function ExportButtons({ filters, apiUrl }: ExportButtonsProps) {
    const [exporting, setExporting] = useState(false);

    const buildQueryString = () => {
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

        return params.toString();
    };

    const handleExport = async (type: 'transactions' | 'dtes' | 'matches' | 'all') => {
        setExporting(true);
        try {
            const queryString = buildQueryString();
            const url = `${apiUrl}/conciliacion/export/excel?type=${type}&${queryString}`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error('Error al exportar');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `conciliacion_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Export error:', error);
            alert('Error al exportar. Por favor intenta de nuevo.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="btn-group" role="group">
            <button
                type="button"
                className="btn btn-success dropdown-toggle d-flex align-items-center gap-2"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                disabled={exporting}
            >
                {exporting ? (
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                ) : (
                    <ArrowDownTrayIcon style={{ width: '16px', height: '16px' }} />
                )}
                Exportar a Excel
            </button>
            <ul className="dropdown-menu">
                <li>
                    <button
                        className="dropdown-item"
                        onClick={() => handleExport('all')}
                        disabled={exporting}
                    >
                        📊 Todo (Completo)
                    </button>
                </li>
                <li><hr className="dropdown-divider" /></li>
                <li>
                    <button
                        className="dropdown-item"
                        onClick={() => handleExport('transactions')}
                        disabled={exporting}
                    >
                        💰 Solo Transacciones
                    </button>
                </li>
                <li>
                    <button
                        className="dropdown-item"
                        onClick={() => handleExport('dtes')}
                        disabled={exporting}
                    >
                        📄 Solo DTEs
                    </button>
                </li>
                <li>
                    <button
                        className="dropdown-item"
                        onClick={() => handleExport('matches')}
                        disabled={exporting}
                    >
                        🔗 Solo Matches
                    </button>
                </li>
            </ul>
        </div>
    );
}
