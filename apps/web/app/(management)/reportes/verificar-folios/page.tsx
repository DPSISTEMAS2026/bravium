'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
    MagnifyingGlassIcon,
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    ClipboardDocumentListIcon,
    ArrowLeftIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '@/lib/api';

interface DteEntry {
    folio: number;
    type: number;
    totalAmount: number;
    paymentStatus: string;
    issuedDate: string;
    provider: string;
    rut: string;
    matchOrigin: string | null;
    matchRule: string | null;
    confidence: number | null;
}

interface NotFoundEntry {
    folio: number;
    existsElsewhere: boolean;
    issuedDate?: string;
    type?: number;
    totalAmount?: number;
    paymentStatus?: string;
    provider?: string;
    rut?: string;
    matchStatuses?: string[];
    hasConfirmedMatch?: boolean;
}

interface VerifyResult {
    period: string;
    totalFoliosRequested: number;
    foundInMonth: number;
    summary: {
        confirmed: number;
        draft: number;
        rejected: number;
        noMatch: number;
        notFoundInMonth: number;
    };
    withConfirmed: DteEntry[];
    withDraft: DteEntry[];
    withRejected: DteEntry[];
    noMatch: DteEntry[];
    notFoundDetails: NotFoundEntry[];
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

export default function VerificarFoliosPage() {
    const API_URL = getApiUrl();

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [foliosText, setFoliosText] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Collapsible sections
    const [showConfirmed, setShowConfirmed] = useState(false);
    const [showNotFound, setShowNotFound] = useState(true);

    const parsedFolios = useMemo(() => {
        if (!foliosText.trim()) return [];
        // Parse: numbers separated by newlines, spaces, commas, dashes (ranges)
        const nums: number[] = [];
        const lines = foliosText.split(/[\n,]+/);
        for (const line of lines) {
            // Handle ranges like "11464 - 5547200" or "420334 -420335- 420336- 420337"
            const parts = line.split(/[\s]*-[\s]*/);
            for (const part of parts) {
                const trimmed = part.trim();
                if (/^\d+$/.test(trimmed)) {
                    nums.push(parseInt(trimmed, 10));
                }
            }
        }
        return [...new Set(nums)];
    }, [foliosText]);

    const handleVerify = async () => {
        if (parsedFolios.length === 0) return;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const authFetch = (await import('@/lib/api')).authFetch;
            const res = await authFetch(`${API_URL}/reportes/verificar-folios`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folios: parsedFolios, year, month }),
            });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            const data = await res.json();
            setResult(data);
            // Auto-expand if there are issues
            setShowConfirmed(data.summary.noMatch === 0 && data.summary.draft === 0);
            setShowNotFound(data.summary.notFoundInMonth > 0);
        } catch (err: any) {
            setError(err.message || 'Error al verificar');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric' });

    const monthLabel = MONTHS.find(m => m.value === month)?.label || '';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/reportes" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                    <ArrowLeftIcon className="h-5 w-5 text-slate-500" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Verificar Folios por Mes</h1>
                    <p className="text-slate-600 mt-1">
                        Pega tu lista de folios, elige el mes, y verifica si tienen match confirmado
                    </p>
                </div>
            </div>

            {/* Input Section */}
            <div className="card p-6 bg-white shadow-sm border border-slate-200 rounded-2xl space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Month/Year selectors */}
                    <div className="flex gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mes</label>
                            <select
                                value={month}
                                onChange={e => setMonth(Number(e.target.value))}
                                className="px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white font-medium min-w-[140px]"
                            >
                                {MONTHS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Año</label>
                            <select
                                value={year}
                                onChange={e => setYear(Number(e.target.value))}
                                className="px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white font-medium"
                            >
                                {[2024, 2025, 2026, 2027].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex-1" />

                    {/* Parse info */}
                    <div className="flex items-end gap-3">
                        {foliosText.trim() && (
                            <div className="text-sm text-slate-500 pb-2">
                                <span className="font-bold text-indigo-600">{parsedFolios.length}</span> folios detectados
                            </div>
                        )}
                        <button
                            onClick={handleVerify}
                            disabled={loading || parsedFolios.length === 0}
                            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
                        >
                            {loading ? (
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            ) : (
                                <MagnifyingGlassIcon className="h-5 w-5" />
                            )}
                            {loading ? 'Verificando...' : 'Verificar'}
                        </button>
                    </div>
                </div>

                {/* Textarea */}
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                        Lista de Folios
                    </label>
                    <textarea
                        value={foliosText}
                        onChange={e => setFoliosText(e.target.value)}
                        placeholder={"Pega aquí los folios (uno por línea, separados por coma, o rangos con guión)\n\nEjemplo:\n1\n9\n33\n11464 - 5547200\n420334 -420335- 420336"}
                        rows={10}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono bg-slate-50 resize-y placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="card p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-red-700 font-medium flex items-center gap-3">
                    <XCircleIcon className="h-6 w-6 shrink-0" />
                    {error}
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <SummaryCard
                            icon={<ClipboardDocumentListIcon className="h-7 w-7" />}
                            label="Folios verificados"
                            value={result.totalFoliosRequested}
                            color="slate"
                        />
                        <SummaryCard
                            icon={<CheckCircleIcon className="h-7 w-7" />}
                            label="Confirmados"
                            value={result.summary.confirmed}
                            color="emerald"
                        />
                        <SummaryCard
                            icon={<ClockIcon className="h-7 w-7" />}
                            label="Draft"
                            value={result.summary.draft}
                            color="amber"
                        />
                        <SummaryCard
                            icon={<XCircleIcon className="h-7 w-7" />}
                            label="Sin match"
                            value={result.summary.noMatch}
                            color="red"
                        />
                        <SummaryCard
                            icon={<ExclamationTriangleIcon className="h-7 w-7" />}
                            label={`No en ${monthLabel}`}
                            value={result.summary.notFoundInMonth}
                            color="blue"
                        />
                    </div>

                    {/* Rate bar */}
                    <div className="card p-5 bg-white shadow-sm border border-slate-200 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-700">
                                Tasa de confirmación en {monthLabel} {year}
                            </span>
                            <span className="text-2xl font-black text-emerald-600">
                                {result.foundInMonth > 0
                                    ? Math.round((result.summary.confirmed / result.foundInMonth) * 100)
                                    : 0}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-3 rounded-full transition-all duration-700"
                                style={{
                                    width: `${result.foundInMonth > 0 ? (result.summary.confirmed / result.foundInMonth) * 100 : 0}%`,
                                }}
                            />
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                            <span>{result.summary.confirmed} confirmados</span>
                            <span>{result.foundInMonth} DTEs en {monthLabel}</span>
                            <span>{result.summary.notFoundInMonth} en otros meses</span>
                        </div>
                    </div>

                    {/* Sin Match (priority!) */}
                    {result.noMatch.length > 0 && (
                        <DteTable
                            title={`Sin Match (${result.noMatch.length})`}
                            icon={<XCircleIcon className="h-5 w-5 text-red-500" />}
                            entries={result.noMatch}
                            bgClass="bg-red-50 border-red-200"
                            headerBg="from-red-50 to-red-100"
                            defaultOpen
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    )}

                    {/* Draft */}
                    {result.withDraft.length > 0 && (
                        <DteTable
                            title={`Match Draft — Pendientes de Confirmar (${result.withDraft.length})`}
                            icon={<ClockIcon className="h-5 w-5 text-amber-500" />}
                            entries={result.withDraft}
                            bgClass="bg-amber-50 border-amber-200"
                            headerBg="from-amber-50 to-amber-100"
                            defaultOpen
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    )}

                    {/* Rejected */}
                    {result.withRejected.length > 0 && (
                        <DteTable
                            title={`Match Rechazado (${result.withRejected.length})`}
                            icon={<XCircleIcon className="h-5 w-5 text-orange-500" />}
                            entries={result.withRejected}
                            bgClass="bg-orange-50 border-orange-200"
                            headerBg="from-orange-50 to-orange-100"
                            defaultOpen
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    )}

                    {/* Confirmed (collapsible) */}
                    {result.withConfirmed.length > 0 && (
                        <DteTable
                            title={`Match Confirmado (${result.withConfirmed.length})`}
                            icon={<CheckCircleIcon className="h-5 w-5 text-emerald-500" />}
                            entries={result.withConfirmed}
                            bgClass="bg-emerald-50 border-emerald-200"
                            headerBg="from-emerald-50 to-emerald-100"
                            defaultOpen={showConfirmed}
                            showOrigin
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    )}

                    {/* Not Found in Month */}
                    {result.notFoundDetails.length > 0 && (
                        <NotFoundTable
                            entries={result.notFoundDetails}
                            monthLabel={monthLabel}
                            year={year}
                            defaultOpen={showNotFound}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── Sub-components ─── */

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        slate: 'from-slate-50 to-slate-100 border-slate-200 text-slate-700',
        emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
        amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
        red: 'from-red-50 to-red-100 border-red-200 text-red-700',
        blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    };
    const classes = colorMap[color] || colorMap.slate;
    return (
        <div className={`p-4 rounded-2xl bg-gradient-to-br border-2 ${classes}`}>
            <div className="flex items-center gap-3">
                {icon}
                <div>
                    <div className="text-2xl font-black">{value}</div>
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
                </div>
            </div>
        </div>
    );
}

function DteTable({
    title, icon, entries, bgClass, headerBg, defaultOpen, showOrigin, formatCurrency, formatDate
}: {
    title: string;
    icon: React.ReactNode;
    entries: DteEntry[];
    bgClass: string;
    headerBg: string;
    defaultOpen?: boolean;
    showOrigin?: boolean;
    formatCurrency: (n: number) => string;
    formatDate: (d: string) => string;
}) {
    const [open, setOpen] = useState(defaultOpen ?? true);
    return (
        <div className={`card overflow-hidden border-2 rounded-2xl ${bgClass}`}>
            <button
                onClick={() => setOpen(!open)}
                className={`w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r ${headerBg} hover:brightness-95 transition-all`}
            >
                <div className="flex items-center gap-3">
                    {icon}
                    <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                </div>
                {open ? <ChevronUpIcon className="h-5 w-5 text-slate-500" /> : <ChevronDownIcon className="h-5 w-5 text-slate-500" />}
            </button>
            {open && (
                <div className="overflow-x-auto bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 font-semibold">
                            <tr>
                                <th className="px-4 py-2.5 text-left">Folio</th>
                                <th className="px-4 py-2.5 text-left">Tipo</th>
                                <th className="px-4 py-2.5 text-right">Monto</th>
                                <th className="px-4 py-2.5 text-left">Estado</th>
                                <th className="px-4 py-2.5 text-left">Proveedor</th>
                                {showOrigin && <th className="px-4 py-2.5 text-left">Origen</th>}
                                {showOrigin && <th className="px-4 py-2.5 text-left">Regla</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {entries.map((e, i) => (
                                <tr key={`${e.folio}-${i}`} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{e.folio}</td>
                                    <td className="px-4 py-2.5">
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold">
                                            {e.type === 33 ? 'Factura' : e.type === 34 ? 'Exenta' : e.type === 61 ? 'NC' : `T${e.type}`}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{formatCurrency(e.totalAmount)}</td>
                                    <td className="px-4 py-2.5">
                                        <StatusBadge status={e.paymentStatus} />
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-700 max-w-[250px] truncate" title={e.provider}>{e.provider}</td>
                                    {showOrigin && (
                                        <td className="px-4 py-2.5">
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${e.matchOrigin === 'MANUAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {e.matchOrigin || '—'}
                                            </span>
                                        </td>
                                    )}
                                    {showOrigin && (
                                        <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate" title={e.matchRule || ''}>{e.matchRule || '—'}</td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function NotFoundTable({
    entries, monthLabel, year, defaultOpen, formatCurrency, formatDate
}: {
    entries: NotFoundEntry[];
    monthLabel: string;
    year: number;
    defaultOpen?: boolean;
    formatCurrency: (n: number) => string;
    formatDate: (d: string) => string;
}) {
    const [open, setOpen] = useState(defaultOpen ?? true);
    const existElsewhere = entries.filter(e => e.existsElsewhere);
    const notInDb = entries.filter(e => !e.existsElsewhere);

    return (
        <div className="card overflow-hidden border-2 rounded-2xl bg-blue-50 border-blue-200">
            <button
                onClick={() => setOpen(!open)}
                className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-blue-100 hover:brightness-95 transition-all"
            >
                <div className="flex items-center gap-3">
                    <DocumentTextIcon className="h-5 w-5 text-blue-500" />
                    <h3 className="text-lg font-bold text-slate-900">
                        No encontrados en {monthLabel} {year} ({entries.length})
                    </h3>
                </div>
                {open ? <ChevronUpIcon className="h-5 w-5 text-slate-500" /> : <ChevronDownIcon className="h-5 w-5 text-slate-500" />}
            </button>
            {open && (
                <div className="bg-white">
                    {existElsewhere.length > 0 && (
                        <div className="overflow-x-auto">
                            <div className="px-4 py-2 text-xs font-bold text-blue-600 uppercase tracking-wider bg-blue-50/50">
                                Existen en otros meses ({existElsewhere.length})
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 font-semibold">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left">Folio</th>
                                        <th className="px-4 py-2.5 text-left">Fecha Real</th>
                                        <th className="px-4 py-2.5 text-left">Tipo</th>
                                        <th className="px-4 py-2.5 text-right">Monto</th>
                                        <th className="px-4 py-2.5 text-left">Estado</th>
                                        <th className="px-4 py-2.5 text-left">Match</th>
                                        <th className="px-4 py-2.5 text-left">Proveedor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {existElsewhere.map((e, i) => (
                                        <tr key={`${e.folio}-${i}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{e.folio}</td>
                                            <td className="px-4 py-2.5 text-slate-600">{e.issuedDate ? formatDate(e.issuedDate) : '—'}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold">
                                                    {e.type === 33 ? 'Factura' : e.type === 34 ? 'Exenta' : e.type === 61 ? 'NC' : `T${e.type}`}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{e.totalAmount ? formatCurrency(e.totalAmount) : '—'}</td>
                                            <td className="px-4 py-2.5">
                                                <StatusBadge status={e.paymentStatus || 'UNKNOWN'} />
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {e.hasConfirmedMatch ? (
                                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-semibold">CONFIRMED</span>
                                                ) : e.matchStatuses && e.matchStatuses.length > 0 ? (
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">{e.matchStatuses.join(', ')}</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-semibold">SIN MATCH</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-700 max-w-[200px] truncate" title={e.provider}>{e.provider || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {notInDb.length > 0 && (
                        <div className="p-4 border-t border-slate-100">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                No existen en la BD ({notInDb.length})
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {notInDb.map((e, i) => (
                                    <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-mono font-semibold">
                                        {e.folio}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        PAID: 'bg-emerald-100 text-emerald-700',
        UNPAID: 'bg-red-100 text-red-600',
        PARTIAL: 'bg-amber-100 text-amber-700',
        OVERPAID: 'bg-blue-100 text-blue-700',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[status] || 'bg-slate-100 text-slate-600'}`}>
            {status}
        </span>
    );
}
