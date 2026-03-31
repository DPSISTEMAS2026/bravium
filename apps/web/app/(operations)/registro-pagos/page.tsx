'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    PlusIcon,
    MagnifyingGlassIcon,
    DocumentTextIcon,
    CurrencyDollarIcon,
    ArrowPathIcon,
    TrashIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl } from '@/lib/api';
import { Pagination } from '@/components/ui/Pagination';

const API = getApiUrl();

const MESES = [
    { value: '', label: 'Todos los meses' },
    { value: '2026-01', label: 'Enero 2026' },
    { value: '2026-02', label: 'Febrero 2026' },
    { value: '2026-03', label: 'Marzo 2026' },
    { value: '2025-12', label: 'Diciembre 2025' },
    { value: '2025-11', label: 'Noviembre 2025' },
];

const MEDIOS_PAGO = [
    'TRANSFERENCIA CUENTA SANTANDER',
    'TARJETA DE CREDITO',
    'TARJETA DE CREDITO SANTANDER',
    'BOTON DE PAGO',
    'EFECTIVO',
    'OTRO',
];

interface PaymentRecord {
    id: string;
    empresa: string;
    detalle: string | null;
    tipoDocumento: string | null;
    folioFactura: string | null;
    monto: number;
    fechaPago: string;
    medioPago: string | null;
    comentario: string | null;
    autorizacion: string | null;
    mesOrigen: string | null;
    transaction: any | null;
    dte: any | null;
}

interface Summary {
    total: number;
    linked: number;
    unlinked: number;
    byMonth: { mes: string; total: number; vinculados: number; monto_total: number }[];
}

export default function RegistroPagosPage() {
    const [records, setRecords] = useState<PaymentRecord[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [mesFilter, setMesFilter] = useState('');
    const [empresaFilter, setEmpresaFilter] = useState('');
    const [vinculadoFilter, setVinculadoFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [showMasivoForm, setShowMasivoForm] = useState(false);

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);

    const formatDate = (s: string) =>
        new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (mesFilter) params.set('mes', mesFilter);
            if (empresaFilter) params.set('empresa', empresaFilter);
            if (vinculadoFilter) params.set('vinculado', vinculadoFilter);
            params.set('page', String(page));
            params.set('limit', '30');

            const [listRes, summaryRes] = await Promise.all([
                fetch(`${API}/payment-records?${params}`),
                fetch(`${API}/payment-records/summary`),
            ]);
            const listData = await listRes.json();
            const summaryData = await summaryRes.json();

            setRecords(listData.records || []);
            setTotal(listData.total || 0);
            setPages(listData.pages || 1);
            setSummary(summaryData);
        } catch (err) {
            console.error('Error loading records:', err);
        } finally {
            setLoading(false);
        }
    }, [mesFilter, empresaFilter, vinculadoFilter, page]);

    useEffect(() => { loadRecords(); }, [loadRecords]);

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminar este registro?')) return;
        await fetch(`${API}/payment-records/${id}`, { method: 'DELETE' });
        loadRecords();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Libro de Pagos</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Todos los pagos del proyecto. Anota aquí cada exportación masiva y los pagos manuales.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setShowForm(false); setShowMasivoForm(!showMasivoForm); }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-emerald-600/20 flex items-center space-x-2 transition-all"
                    >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                        <span>Anotar exportación masivo</span>
                    </button>
                    <button
                        onClick={() => { setShowMasivoForm(false); setShowForm(!showForm); }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-all"
                    >
                        <PlusIcon className="h-5 w-5" />
                        <span>Nuevo Pago</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="card-glass p-5">
                        <div className="text-3xl font-bold text-slate-900">{summary.total}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase mt-1">Total Registros</div>
                    </div>
                    <div className="card-glass p-5">
                        <div className="text-3xl font-bold text-emerald-600">{summary.linked}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase mt-1">Vinculados a Banco</div>
                    </div>
                    <div className="card-glass p-5">
                        <div className="text-3xl font-bold text-amber-600">{summary.unlinked}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase mt-1">Sin Vincular</div>
                    </div>
                    <div className="card-glass p-5">
                        <div className="text-3xl font-bold text-indigo-600">
                            {summary.total > 0 ? ((summary.linked / summary.total) * 100).toFixed(0) : 0}%
                        </div>
                        <div className="text-xs text-slate-500 font-medium uppercase mt-1">Tasa Vinculacion</div>
                    </div>
                </div>
            )}

            {/* Anotar exportación masivo */}
            {showMasivoForm && (
                <AnotarMasivoForm
                    onSaved={() => { setShowMasivoForm(false); loadRecords(); }}
                    onCancel={() => setShowMasivoForm(false)}
                />
            )}

            {/* New Payment Form */}
            {showForm && (
                <NewPaymentForm
                    onSaved={() => { setShowForm(false); loadRecords(); }}
                    onCancel={() => setShowForm(false)}
                    formatCurrency={formatCurrency}
                />
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
                <select value={mesFilter} onChange={(e) => { setMesFilter(e.target.value); setPage(1); }}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div className="relative flex-1 min-w-[200px]">
                    <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar empresa..."
                        value={empresaFilter}
                        onChange={(e) => { setEmpresaFilter(e.target.value); setPage(1); }}
                        className="border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm w-full focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <select value={vinculadoFilter} onChange={(e) => { setVinculadoFilter(e.target.value); setPage(1); }}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Todos</option>
                    <option value="si">Vinculados</option>
                    <option value="no">Sin vincular</option>
                </select>
                <span className="text-xs text-slate-400 ml-auto">{total} registros</span>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <ArrowPathIcon className="h-8 w-8 text-indigo-500 animate-spin" />
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
                                <tr>
                                    <th className="px-4 py-3 text-left">Fecha</th>
                                    <th className="px-4 py-3 text-left">Empresa</th>
                                    <th className="px-4 py-3 text-left">Detalle</th>
                                    <th className="px-4 py-3 text-left">Factura</th>
                                    <th className="px-4 py-3 text-right">Monto</th>
                                    <th className="px-4 py-3 text-left">Medio</th>
                                    <th className="px-4 py-3 text-left">Comentario</th>
                                    <th className="px-4 py-3 text-center">Vinculo</th>
                                    <th className="px-4 py-3 text-center">Acc.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {records.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{formatDate(r.fechaPago)}</td>
                                        <td className="px-4 py-3 font-medium text-slate-900">{r.empresa}</td>
                                        <td className="px-4 py-3 text-slate-600 text-xs max-w-[200px] truncate" title={r.detalle || ''}>
                                            {r.detalle || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.folioFactura ? (
                                                <span className="text-indigo-700 font-bold text-xs">{r.folioFactura}</span>
                                            ) : (
                                                <span className="text-slate-300 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-800">{formatCurrency(r.monto)}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[120px] truncate" title={r.medioPago || ''}>
                                            {r.medioPago ? r.medioPago.replace('TRANSFERENCIA CUENTA SANTANDER', 'Transf. Santander').replace('TARJETA DE CREDITO', 'TC') : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate" title={r.comentario || ''}>
                                            {r.comentario || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {r.transaction ? (
                                                    <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title={r.transaction.description}>
                                                        <CurrencyDollarIcon className="h-3 w-3 mr-0.5" />TX
                                                    </span>
                                                ) : null}
                                                {r.dte ? (
                                                    <span className="inline-flex items-center text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200" title={`Folio ${r.dte.folio}`}>
                                                        <DocumentTextIcon className="h-3 w-3 mr-0.5" />DTE
                                                    </span>
                                                ) : null}
                                                {!r.transaction && !r.dte && (
                                                    <span className="text-slate-300 text-[10px]">—</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleDelete(r.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {records.length === 0 && (
                        <div className="text-center py-12 text-slate-400">No se encontraron registros</div>
                    )}

                    {/* Pagination */}
                    <Pagination 
                        currentPage={page} 
                        totalPages={pages} 
                        onPageChange={(p: number) => setPage(p)} 
                    />
                </div>
            )}
        </div>
    );
}

function AnotarMasivoForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
    const [comentario, setComentario] = useState('');
    const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!comentario.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/payment-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empresa: 'Exportación masivo',
                    detalle: comentario.trim(),
                    tipoDocumento: null,
                    folioFactura: null,
                    monto: 0,
                    fechaPago,
                    medioPago: 'TRANSFERENCIA CUENTA SANTANDER',
                    comentario: comentario.trim(),
                    autorizacion: null,
                }),
            });
            if (res.ok) onSaved();
            else alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-emerald-200 p-6 shadow-lg shadow-emerald-100/50 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Anotar exportación masivo</h3>
            <p className="text-sm text-slate-500">Registra aquí cada vez que exportes un archivo de pago masivo (ej. Santander) para tener trazabilidad en el libro de pagos.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Detalle * (ej. Santander - 15 pagos, fecha archivo 12/03/2026)</label>
                    <input required value={comentario} onChange={e => setComentario(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" placeholder="Ej: Santander - 15 pagos" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
                    <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
            </div>
            <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm">
                    {saving ? 'Guardando...' : 'Anotar'}
                </button>
                <button type="button" onClick={onCancel}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-2 rounded-lg text-sm font-medium">
                    Cancelar
                </button>
            </div>
        </form>
    );
}

function NewPaymentForm({ onSaved, onCancel, formatCurrency }: {
    onSaved: () => void;
    onCancel: () => void;
    formatCurrency: (n: number) => string;
}) {
    const [form, setForm] = useState({
        empresa: '',
        detalle: '',
        tipoDocumento: 'Factura',
        folioFactura: '',
        monto: '',
        fechaPago: new Date().toISOString().split('T')[0],
        medioPago: 'TRANSFERENCIA CUENTA SANTANDER',
        comentario: '',
        autorizacion: 'OK',
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.empresa || !form.monto || !form.fechaPago) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/payment-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    monto: parseFloat(form.monto),
                    folioFactura: form.folioFactura || null,
                }),
            });
            if (res.ok) onSaved();
            else alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-indigo-200 p-6 shadow-lg shadow-indigo-100/50 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Registrar Nuevo Pago</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Empresa *</label>
                    <input required value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Ej: Falabella" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Detalle</label>
                    <input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Ej: 1 cuota de 6" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo Documento</label>
                    <select value={form.tipoDocumento} onChange={e => setForm({ ...form, tipoDocumento: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                        <option>Factura</option>
                        <option>Boleta</option>
                        <option>Contrato</option>
                        <option>Recibo</option>
                        <option>Otro</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">N° Factura</label>
                    <input value={form.folioFactura} onChange={e => setForm({ ...form, folioFactura: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Ej: 52472825" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Monto *</label>
                    <input required type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="89272" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de Pago *</label>
                    <input required type="date" value={form.fechaPago} onChange={e => setForm({ ...form, fechaPago: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Medio de Pago</label>
                    <select value={form.medioPago} onChange={e => setForm({ ...form, medioPago: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                        {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Comentario</label>
                    <input value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" placeholder="Ej: Celulares equipo e internet portatil" />
                </div>
            </div>
            <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 shadow-sm">
                    {saving ? 'Guardando...' : 'Guardar Pago'}
                </button>
                <button type="button" onClick={onCancel}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-2 rounded-lg text-sm font-medium">
                    Cancelar
                </button>
            </div>
        </form>
    );
}
