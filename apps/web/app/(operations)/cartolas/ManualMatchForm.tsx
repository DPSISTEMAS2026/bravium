'use client';

import { useState } from 'react';
import { PlusCircleIcon, LinkIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

export function ManualMatchForm({
    API_URL,
    onRefresh,
    formatCurrency,
}: {
    API_URL: string;
    onRefresh: () => void;
    formatCurrency: (n: number) => string;
}) {
    const [txSearch, setTxSearch] = useState('');
    const [dteSearch, setDteSearch] = useState('');
    const [pendingTxs, setPendingTxs] = useState<any[]>([]);
    const [unpaidDtes, setUnpaidDtes] = useState<any[]>([]);
    const [selectedTx, setSelectedTx] = useState<any>(null);
    const [selectedDte, setSelectedDte] = useState<any>(null);
    const [creating, setCreating] = useState(false);
    const [txLoading, setTxLoading] = useState(false);
    const [dteLoading, setDteLoading] = useState(false);

    const searchTxs = async () => {
        if (!txSearch.trim()) return;
        setTxLoading(true);
        try {
            const params = new URLSearchParams({ search: txSearch, status: 'PENDING', limit: '20' });
            const res = await fetch(`${API_URL}/transactions?${params}`);
            if (res.ok) {
                const data = await res.json();
                setPendingTxs(Array.isArray(data) ? data : data.data || []);
            }
        } catch { /* ignore */ }
        finally { setTxLoading(false); }
    };

    const searchDtes = async () => {
        if (!dteSearch.trim()) return;
        setDteLoading(true);
        try {
            const params = new URLSearchParams({ search: dteSearch, paymentStatus: 'UNPAID', limit: '20' });
            const res = await fetch(`${API_URL}/dtes?${params}`);
            if (res.ok) {
                const data = await res.json();
                setUnpaidDtes(Array.isArray(data) ? data : data.data || []);
            }
        } catch { /* ignore */ }
        finally { setDteLoading(false); }
    };

    const createManualMatch = async () => {
        if (!selectedTx || !selectedDte) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: selectedTx.id, dteId: selectedDte.id }),
            });
            if (res.ok) {
                setSelectedTx(null);
                setSelectedDte(null);
                setPendingTxs([]);
                setUnpaidDtes([]);
                setTxSearch('');
                setDteSearch('');
                onRefresh();
            }
        } catch { /* ignore */ }
        finally { setCreating(false); }
    };

    return (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <PlusCircleIcon className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-700">Crear match manual</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Busca un movimiento pendiente y una factura sin pagar (por folio, proveedor o monto) para vincularlas.
                </p>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Transacción bancaria</label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={txSearch}
                                onChange={e => setTxSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchTxs()}
                                placeholder="Buscar por descripción o monto..."
                                className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                            />
                            <button onClick={searchTxs} disabled={txLoading} className="px-2 py-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                                <MagnifyingGlassIcon className="h-4 w-4" />
                            </button>
                        </div>
                        {selectedTx && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-2 flex justify-between items-center">
                                <div className="text-sm text-indigo-900 truncate">{selectedTx.description}</div>
                                <button type="button" onClick={() => setSelectedTx(null)}>
                                    <XMarkIcon className="h-4 w-4 text-indigo-500" />
                                </button>
                            </div>
                        )}
                        {pendingTxs.length > 0 && !selectedTx && (
                            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {pendingTxs.map((tx: any) => (
                                    <button
                                        key={tx.id}
                                        type="button"
                                        onClick={() => setSelectedTx(tx)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 text-sm"
                                    >
                                        {tx.description} · {formatCurrency(tx.amount)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Factura (DTE)</label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={dteSearch}
                                onChange={e => setDteSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchDtes()}
                                placeholder="Buscar por folio (ej. 416423), proveedor..."
                                className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                            />
                            <button onClick={searchDtes} disabled={dteLoading} className="px-2 py-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                                <MagnifyingGlassIcon className="h-4 w-4" />
                            </button>
                        </div>
                        {selectedDte && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 mb-2 flex justify-between items-center">
                                <div className="text-sm text-emerald-900 truncate">
                                    Folio {selectedDte.folio} - {selectedDte.provider?.name}
                                </div>
                                <button type="button" onClick={() => setSelectedDte(null)}>
                                    <XMarkIcon className="h-4 w-4 text-emerald-500" />
                                </button>
                            </div>
                        )}
                        {unpaidDtes.length > 0 && !selectedDte && (
                            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {unpaidDtes.map((dte: any) => (
                                    <button
                                        key={dte.id}
                                        type="button"
                                        onClick={() => setSelectedDte(dte)}
                                        className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 text-sm"
                                    >
                                        Folio {dte.folio} - {dte.provider?.name} · {formatCurrency(dte.totalAmount)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {selectedTx && selectedDte && (
                    <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm text-slate-600">
                            {selectedTx.description} ↔ Folio {selectedDte.folio} · Dif:{' '}
                            {formatCurrency(Math.abs(Math.abs(selectedTx.amount) - Math.abs(selectedDte.totalAmount)))}
                        </span>
                        <button
                            type="button"
                            onClick={createManualMatch}
                            disabled={creating}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                        >
                            <LinkIcon className="h-4 w-4" /> Crear match
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
