'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
    MagnifyingGlassIcon,
    BanknotesIcon,
    CheckCircleIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    DocumentTextIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, authFetch, apiFetcher } from '../../../lib/api';

const MEDIOS_PAGO = [
    'TARJETA DE CREDITO',
    'TARJETA DE CREDITO SANTANDER',
    'TRANSFERENCIA CUENTA SANTANDER',
];

const API = getApiUrl();

const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

type Bucket = 'estaSemana' | 'vencido' | 'proximo';

interface QueueDte {
    id: string;
    folio: number;
    type: number;
    totalAmount: number;
    outstandingAmount: number;
    issuedDate: string;
    daysSinceIssue: number;
    daysToDue: number;
    bucket: Bucket;
    provider: {
        id: string;
        name: string;
        rut: string;
        transferBankName?: string | null;
        transferAccountNumber?: string | null;
        transferAccountType?: string | null;
    } | null;
}

interface ProviderHit {
    id: string;
    name: string;
    rut: string;
    transferBankName?: string | null;
    transferAccountNumber?: string | null;
}

export default function LibroDePagosPage() {
    const [bucket, setBucket] = useState<'accion' | Bucket | 'todos'>('accion');
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [paying, setPaying] = useState(false);
    const [payMsg, setPayMsg] = useState<string | null>(null);
    const [payErr, setPayErr] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [provQ, setProvQ] = useState('');
    const [provHits, setProvHits] = useState<ProviderHit[]>([]);
    const [provider, setProvider] = useState<ProviderHit | null>(null);
    const [folioQ, setFolioQ] = useState('');
    const [folioHits, setFolioHits] = useState<QueueDte[]>([]);
    const [formDte, setFormDte] = useState<QueueDte | null>(null);

    const [gastoItem, setGastoItem] = useState('');
    const [gastoDetalle, setGastoDetalle] = useState('');
    const [gastoMonto, setGastoMonto] = useState('');
    const [gastoFecha, setGastoFecha] = useState(() => new Date().toISOString().slice(0, 10));
    const [gastoMedio, setGastoMedio] = useState(MEDIOS_PAGO[0]);

    const { data: queue, mutate: mutateQueue, isLoading } = useSWR(`${API}/payment-records/week-queue`, apiFetcher);
    const { data: declared, mutate: mutateDeclared } = useSWR(
        `${API}/payment-records?autorizacion=PENDIENTE_CARTOLA&limit=50`,
        apiFetcher,
    );
    const { data: confirmed, mutate: mutateConfirmed } = useSWR(
        `${API}/payment-records?autorizacion=DOBLE_VERIFICADO&limit=20`,
        apiFetcher,
    );

    const dtes: QueueDte[] = queue?.dtes || [];
    const summary = queue?.summary;

    const visible = useMemo(() => {
        let list = dtes;
        if (bucket === 'accion') list = dtes.filter((d) => d.bucket === 'estaSemana' || d.bucket === 'vencido');
        else if (bucket !== 'todos') list = dtes.filter((d) => d.bucket === bucket);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((d) =>
                String(d.folio).includes(q) ||
                (d.provider?.name || '').toLowerCase().includes(q) ||
                (d.provider?.rut || '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [dtes, bucket, search]);

    const selectedIds = Object.keys(selected).filter((id) => selected[id]);
    const selectedAmount = visible.filter((d) => selected[d.id]).reduce((s, d) => s + (d.outstandingAmount || d.totalAmount), 0);

    const toggle = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    const toggleAll = () => {
        const allOn = visible.length > 0 && visible.every((d) => selected[d.id]);
        const next: Record<string, boolean> = { ...selected };
        for (const d of visible) next[d.id] = !allOn;
        setSelected(next);
    };

    const searchProviders = async (q: string) => {
        setProvQ(q);
        setProvider(null);
        setFormDte(null);
        if (q.trim().length < 2) {
            setProvHits([]);
            return;
        }
        const res = await authFetch(`${API}/proveedores?search=${encodeURIComponent(q)}&limit=8`);
        if (!res.ok) return;
        const data = await res.json();
        setProvHits(data.data || data || []);
    };

    const searchFolios = async (q: string, providerId?: string) => {
        setFolioQ(q);
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (providerId) params.set('providerId', providerId);
        const res = await authFetch(`${API}/payment-records/folios?${params}`);
        if (!res.ok) return;
        setFolioHits(await res.json());
    };

    const pickProvider = (p: ProviderHit) => {
        setProvider(p);
        setProvQ(p.name);
        setProvHits([]);
        searchFolios(folioQ, p.id);
    };

    const pickFolio = (d: QueueDte) => {
        setFormDte(d);
        setFolioQ(String(d.folio));
        setFolioHits([]);
        if (d.provider) {
            setProvider(d.provider);
            setProvQ(d.provider.name);
        }
        setSelected((prev) => ({ ...prev, [d.id]: true }));
    };

    const pagar = async (ids: string[]) => {
        if (!ids.length) return;
        setPaying(true);
        setPayErr(null);
        setPayMsg(null);
        try {
            const res = await authFetch(`${API}/payment-records/declare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dteIds: ids,
                    fechaPago: new Date().toISOString().slice(0, 10),
                    medioPago: 'TRANSFERENCIA CUENTA SANTANDER',
                    comentario: 'Declarado en Libro de Pagos — pendiente cartola viernes',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'No se pudo declarar el pago');
            const excelOk = data.excel?.pagosCl || data.excel?.control;
            setPayMsg(
                `Se declararon ${data.declared} pagos por ${formatCurrency(data.totalAmount)}. ` +
                (excelOk
                    ? 'Quedaron en el Excel de Pagos CL (PENDIENTE_CARTOLA). El viernes la cartola confirma si salieron.'
                    : 'Quedaron en la plataforma. El Excel no se pudo escribir (¿está abierto?).'),
            );
            setSelected({});
            setFormDte(null);
            mutateQueue();
            mutateDeclared();
        } catch (e: any) {
            setPayErr(e.message || 'Error al pagar');
        } finally {
            setPaying(false);
        }
    };

    const declararGastoLibre = async () => {
        const item = gastoItem.trim();
        const monto = Number(String(gastoMonto).replace(/\./g, '').replace(',', '.'));
        if (!item || !monto || monto <= 0 || !gastoFecha) {
            setPayErr('Indica ítem, monto y fecha. No hace falta factura ni saber el comercio de la glosa.');
            return;
        }
        setPaying(true);
        setPayErr(null);
        setPayMsg(null);
        try {
            const res = await authFetch(`${API}/payment-records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empresa: item,
                    detalle: gastoDetalle.trim() || undefined,
                    tipoDocumento: 'Gasto',
                    monto,
                    fechaPago: gastoFecha,
                    medioPago: gastoMedio,
                    comentario: 'Gasto sin factura — Libro de Pagos',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'No se pudo registrar el gasto');
            const vinculado = !!data.transactionId;
            setPayMsg(
                `Registrado: ${item} por ${formatCurrency(monto)}` +
                (vinculado
                    ? '. Ya estaba en la cartola: quedó identificado con ese ítem (el comercio de la glosa, si aparece, queda como vía).'
                    : '. Quedó pendiente de cartola; el viernes se cruza por monto y fecha.'),
            );
            setGastoItem('');
            setGastoDetalle('');
            setGastoMonto('');
            mutateDeclared();
            mutateConfirmed();
        } catch (e: any) {
            setPayErr(e.message || 'Error al registrar el gasto');
        } finally {
            setPaying(false);
        }
    };

    const bucketLabel = (b: Bucket) =>
        b === 'vencido' ? 'Vencida' : b === 'estaSemana' ? 'Esta semana' : 'Próxima';

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Libro de Pagos</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Lo que hay que pagar esta semana (30 días desde emitida). Declarar no marca la factura como pagada:
                    eso lo confirma la cartola del viernes.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-semibold uppercase text-slate-500">A pagar ahora</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(summary?.totalActionableAmount || 0)}</div>
                    <div className="text-xs text-slate-500 mt-1">{summary?.totalActionable || 0} folios · {summary?.providersToPay || 0} proveedores</div>
                </div>
                <div className="bg-white border border-amber-200 rounded-xl p-5">
                    <div className="text-xs font-semibold uppercase text-amber-700">Esta semana (≤ 7 días)</div>
                    <div className="text-2xl font-bold text-amber-800 mt-1">{formatCurrency(summary?.estaSemana?.amount || 0)}</div>
                    <div className="text-xs text-amber-700 mt-1">{summary?.estaSemana?.count || 0} folios</div>
                </div>
                <div className="bg-white border border-rose-200 rounded-xl p-5">
                    <div className="text-xs font-semibold uppercase text-rose-700">Ya vencidas (+30 días)</div>
                    <div className="text-2xl font-bold text-rose-800 mt-1">{formatCurrency(summary?.vencido?.amount || 0)}</div>
                    <div className="text-xs text-rose-700 mt-1">{summary?.vencido?.count || 0} folios</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-semibold uppercase text-slate-500">Declarados, esperan cartola</div>
                    <div className="text-2xl font-bold text-indigo-700 mt-1">{declared?.total || 0}</div>
                    <div className="text-xs text-slate-500 mt-1">Doble verificación el viernes</div>
                </div>
            </div>

            {payMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-3">{payMsg}</div>
            )}
            {payErr && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl px-4 py-3">{payErr}</div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Registrar un pago (prellenado)</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Proveedor</label>
                        <input
                            value={provQ}
                            onChange={(e) => searchProviders(e.target.value)}
                            placeholder="Escribe el nombre…"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                        {provHits.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                                {provHits.map((p) => (
                                    <button key={p.id} type="button" onClick={() => pickProvider(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50">
                                        <div className="font-semibold text-slate-800">{p.name}</div>
                                        <div className="text-[11px] text-slate-500">{p.rut}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">RUT</label>
                        <input readOnly value={provider?.rut || ''} className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Banco / cuenta</label>
                        <input
                            readOnly
                            value={provider?.transferBankName ? `${provider.transferBankName} ${provider.transferAccountNumber || ''}`.trim() : ''}
                            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600"
                            placeholder="Se completa al elegir proveedor"
                        />
                    </div>
                    <div className="relative">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Folio pendiente</label>
                        <input
                            value={folioQ}
                            onChange={(e) => searchFolios(e.target.value, provider?.id)}
                            onFocus={() => searchFolios(folioQ, provider?.id)}
                            placeholder="Ej: 00 → folios pendientes"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                        {folioHits.length > 0 && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                                {folioHits.map((d) => (
                                    <button key={d.id} type="button" onClick={() => pickFolio(d)} className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50">
                                        <div className="flex justify-between">
                                            <span className="font-bold text-slate-800">#{d.folio}</span>
                                            <span className="font-mono text-slate-700">{formatCurrency(d.outstandingAmount || d.totalAmount)}</span>
                                        </div>
                                        <div className="text-[11px] text-slate-500">{d.provider?.name} · {formatDate(d.issuedDate)}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Monto</label>
                        <input
                            readOnly
                            value={formDte ? formatCurrency(formDte.outstandingAmount || formDte.totalAmount) : ''}
                            className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm font-semibold"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            disabled={!formDte || paying}
                            onClick={() => formDte && pagar([formDte.id])}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold text-sm rounded-lg py-2.5"
                        >
                            Declarar este folio
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Gasto sin factura</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Para ítems como Kano o Punta Ranco: registra lo que pagaste. No hace falta el comercio de la cartola (Relani, Mercado Pago, etc.).
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Ítem *</label>
                        <input
                            value={gastoItem}
                            onChange={(e) => setGastoItem(e.target.value)}
                            placeholder="Ej: Kano, Punta ranco…"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Detalle</label>
                        <input
                            value={gastoDetalle}
                            onChange={(e) => setGastoDetalle(e.target.value)}
                            placeholder="Opcional"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Monto *</label>
                        <input
                            type="number"
                            min={1}
                            value={gastoMonto}
                            onChange={(e) => setGastoMonto(e.target.value)}
                            placeholder="499950"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de pago *</label>
                        <input
                            type="date"
                            value={gastoFecha}
                            onChange={(e) => setGastoFecha(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Medio</label>
                        <select
                            value={gastoMedio}
                            onChange={(e) => setGastoMedio(e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                        >
                            {MEDIOS_PAGO.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            disabled={paying}
                            onClick={declararGastoLibre}
                            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-semibold text-sm rounded-lg py-2.5"
                        >
                            Registrar gasto
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex-1">Pendientes de la semana</h2>
                    <div className="flex gap-1">
                        {([
                            ['accion', 'A pagar'],
                            ['estaSemana', 'Esta semana'],
                            ['vencido', 'Vencidas'],
                            ['proximo', 'Próximas'],
                            ['todos', 'Todas'],
                        ] as const).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => setBucket(id)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${bucket === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <MagnifyingGlassIcon className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Proveedor o folio"
                            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-48"
                        />
                    </div>
                    <button
                        type="button"
                        disabled={selectedIds.length === 0 || paying}
                        onClick={() => pagar(selectedIds)}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold text-sm rounded-lg px-4 py-2 flex items-center gap-2"
                    >
                        {paying ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BanknotesIcon className="h-4 w-4" />}
                        Pagar {selectedIds.length || ''} {selectedIds.length ? `· ${formatCurrency(selectedAmount)}` : 'seleccionados'}
                    </button>
                </div>

                {isLoading ? (
                    <div className="p-10 text-center text-slate-400 text-sm">Cargando cola de la semana…</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-semibold">
                                <tr>
                                    <th className="px-4 py-3">
                                        <input type="checkbox" onChange={toggleAll} checked={visible.length > 0 && visible.every((d) => selected[d.id])} />
                                    </th>
                                    <th className="px-4 py-3 text-left">Estado</th>
                                    <th className="px-4 py-3 text-left">Proveedor</th>
                                    <th className="px-4 py-3 text-left">Folio</th>
                                    <th className="px-4 py-3 text-left">Emitida</th>
                                    <th className="px-4 py-3 text-right">Monto</th>
                                    <th className="px-4 py-3 text-right">Días a 30</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visible.map((d) => (
                                    <tr key={d.id} className={selected[d.id] ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}>
                                        <td className="px-4 py-3">
                                            <input type="checkbox" checked={!!selected[d.id]} onChange={() => toggle(d.id)} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                                                d.bucket === 'vencido' ? 'bg-rose-100 text-rose-800' :
                                                d.bucket === 'estaSemana' ? 'bg-amber-100 text-amber-800' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {d.bucket === 'vencido' ? <ExclamationTriangleIcon className="h-3 w-3" /> : <ClockIcon className="h-3 w-3" />}
                                                {bucketLabel(d.bucket)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{d.provider?.name || '—'}</div>
                                            <div className="text-[11px] text-slate-400">{d.provider?.rut}</div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-800">#{d.folio}</td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(d.issuedDate)}</td>
                                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(d.outstandingAmount || d.totalAmount)}</td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600">{d.daysToDue}</td>
                                    </tr>
                                ))}
                                {visible.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay folios en este filtro.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                        <ClockIcon className="h-4 w-4 text-amber-600" />
                        Declarados — esperan cartola del viernes
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-auto">
                        {(declared?.records || []).map((r: any) => (
                            <div key={r.id} className="flex justify-between text-sm border border-amber-100 bg-amber-50/50 rounded-lg px-3 py-2">
                                <div>
                                    <div className="font-semibold text-slate-800">{r.empresa}</div>
                                    <div className="text-[11px] text-slate-500">
                                        {r.folioFactura ? `Folio ${r.folioFactura}` : (r.medioPago || 'Sin factura')}
                                        {' · '}
                                        {formatDate(r.fechaPago)}
                                    </div>
                                </div>
                                <div className="text-right font-semibold">{formatCurrency(r.monto)}</div>
                            </div>
                        ))}
                        {!(declared?.records || []).length && (
                            <p className="text-sm text-slate-400">Aún no hay declaraciones pendientes.</p>
                        )}
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                        <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                        Confirmados en cartola
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-auto">
                        {(confirmed?.records || []).map((r: any) => (
                            <div key={r.id} className="flex justify-between text-sm border border-emerald-100 bg-emerald-50/50 rounded-lg px-3 py-2">
                                <div>
                                    <div className="font-semibold text-slate-800">{r.empresa}</div>
                                    <div className="text-[11px] text-slate-500">
                                        {r.folioFactura ? `Folio ${r.folioFactura}` : (r.medioPago || 'Sin factura')}
                                        {r.transaction?.description ? ' · glosa ok' : ''}
                                    </div>
                                </div>
                                <div className="text-right font-semibold">{formatCurrency(r.monto)}</div>
                            </div>
                        ))}
                        {!(confirmed?.records || []).length && (
                            <p className="text-sm text-slate-400 flex items-center gap-1">
                                <DocumentTextIcon className="h-4 w-4" />
                                Cuando ingrese la cartola semanal, estos pagos pasan a doble verificado.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
