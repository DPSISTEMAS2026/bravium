'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
    if (totalPages <= 1) return null;

    // Generar los números de página a mostrar (Lógica tipo Google: current ± 2)
    const getPageNumbers = () => {
        const pages = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 3) {
                // Inicio: 1 2 3 4 ... total
                for (let i = 1; i <= 4; i++) pages.push(i);
                pages.push('...');
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                // Final: 1 ... 5 6 7 8
                pages.push(1);
                pages.push('...');
                for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
            } else {
                // Medio: 1 ... 4 5 6 ... total
                pages.push(1);
                pages.push('...');
                pages.push(currentPage - 1);
                pages.push(currentPage);
                pages.push(currentPage + 1);
                pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    };

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Anterior"
            >
                <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1">
                {getPageNumbers().map((p, idx) => {
                    if (p === '...') {
                        return (
                            <span key={`dots-${idx}`} className="px-2 text-slate-400">
                                ...
                            </span>
                        );
                    }

                    const pageNum = p as number;
                    const isActive = pageNum === currentPage;

                    return (
                        <button
                            key={pageNum}
                            onClick={() => onPageChange(pageNum)}
                            className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-semibold border transition-all duration-200 ${
                                isActive
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            {pageNum}
                        </button>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Siguiente"
            >
                <ChevronRightIcon className="h-4 w-4" />
            </button>

            <div className="ml-2 flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest hidden sm:inline">Ir a:</span>
                <select
                    value={currentPage}
                    onChange={(e) => onPageChange(Number(e.target.value))}
                    className="h-8 px-2 py-0 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                    {Array.from({ length: totalPages }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                            Pág. {i + 1}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
