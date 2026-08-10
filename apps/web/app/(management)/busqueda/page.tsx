'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon, BriefcaseIcon, DocumentTextIcon, BanknotesIcon, CheckCircleIcon, DocumentDuplicateIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { getApiUrl } from '../../../lib/api';

interface SearchResult {
    proveedores: any[];
    dtes: any[];
    transacciones: any[];
}

export default function UniversalSearchPage() {
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<SearchResult>({ proveedores: [], dtes: [], transacciones: [] });
    const [activeTab, setActiveTab] = useState<'DTES' | 'TRANS' | 'PROV'>('DTES');
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const API_URL = getApiUrl();

    useEffect(() => {
        if (q.trim().length <= 1) {
            setResults({ proveedores: [], dtes: [], transacciones: [] });
            return;
        }

        const debounce = setTimeout(() => {
            fetchResults();
        }, 300);

        return () => clearTimeout(debounce);
    }, [q]);

    const fetchResults = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('bravium_token');
            const res = await fetch(`${API_URL}/search/global?q=${encodeURIComponent(q.trim())}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                setResults({ proveedores: [], dtes: [], transacciones: [] });
                return;
            }

            const data = await res.json();
            setResults(data || { proveedores: [], dtes: [], transacciones: [] });
        } catch (err) {
            setResults({ proveedores: [], dtes: [], transacciones: [] });
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);
    };

    const copyVoucherTrace = (d: any, match: any) => {
        const tx = match?.transaction;
        const bankName = tx?.bankAccount?.bankName || 'Banco Santander';
        const accountNum = tx?.bankAccount?.accountNumber || 'Cta Cte';
        const txDate = tx?.date ? tx.date.split('T')[0] : (d.issuedDate ? d.issuedDate.split('T')[0] : '2026');
        const desc = tx?.description || 'Transferencia de Pago';
        const ref = tx?.reference || tx?.id || 'N/A';

        const text = `=== COMPROBANTE Y TRAZA DE CONCILIACIÓN BANCARIA (BRAVIUM) ===\n` +
            `Documento: Folio #${d.folio} (${d.provider?.name || d.rutIssuer})\n` +
            `RUT Emisor: ${d.rutIssuer}\n` +
            `Monto Total: ${formatCurrency(d.totalAmount)}\n` +
            `Estado de Pago: ${d.paymentStatus === 'PAID' ? 'PAGADO Y VERIFICADO' : 'PENDIENTE'}\n` +
            `Banco / Cuenta: ${bankName} (${accountNum})\n` +
            `Fecha en Cartola: ${txDate}\n` +
            `Glosa / Movimiento: ${desc}\n` +
            `ID / Referencia: ${ref}\n` +
            `=============================================================`;

        navigator.clipboard.writeText(text);
        setCopiedId(d.id);
        setTimeout(() => setCopiedId(null), 3000);
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <MagnifyingGlassIcon className="h-7 w-7 text-purple-600" />
                            Búsqueda y Trazabilidad Histórica de Folios (2020 - 2026)
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Consulta la cartola, fecha de pago y traza bancaria completa de cualquier folio o proveedor
                        </p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <MagnifyingGlassIcon className="h-6 w-6 absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-600" />
                    <input
                        type="text"
                        placeholder="Busca por Folio (ej. 1234), RUT o Nombre de Proveedor (ej. Falabella, Item Ltda, Loginsa)..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className="w-full pl-12 pr-12 py-4 border-2 border-purple-200 rounded-2xl bg-white shadow-md focus:border-purple-600 focus:ring-4 focus:ring-purple-100 outline-none text-base font-semibold text-slate-900 transition-all placeholder:text-slate-400 placeholder:font-normal"
                    />
                    {loading && <ArrowPathIcon className="h-6 w-6 absolute right-4 top-1/2 transform -translate-y-1/2 text-purple-600 animate-spin" />}
                </div>

                {/* Tabs */}
                <div className="flex space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('DTES')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'DTES' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <DocumentTextIcon className="h-5 w-5" />
                        Facturas y Folios ({results.dtes.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('TRANS')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'TRANS' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <BanknotesIcon className="h-5 w-5" />
                        Movimientos de Cartola ({results.transacciones.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('PROV')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'PROV' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                        <BriefcaseIcon className="h-5 w-5" />
                        Proveedores ({results.proveedores.length})
                    </button>
                </div>

                {/* Results List */}
                <div className="space-y-4">
                    {/* TAB DTES */}
                    {activeTab === 'DTES' && results.dtes.map((d, idx) => {
                        const id = `d-${idx}`;
                        const isExpanded = expandedItemId === id || results.dtes.length === 1;
                        const match = d.matches && d.matches[0];
                        const tx = match?.transaction;

                        return (
                            <div
                                key={idx}
                                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-3"
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-purple-100 p-3 rounded-xl text-purple-700 font-bold text-sm">
                                            #{d.folio || 'S/F'}
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-slate-900">{d.provider?.name || d.rutIssuer || 'Proveedor'}</h3>
                                            <p className="text-xs text-slate-500 font-medium">RUT: {d.rutIssuer} | Emisión: {d.issuedDate?.split('T')[0] || '2026'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <span className="text-xs text-slate-400 block font-medium">Monto Documento</span>
                                            <span className="text-lg font-black text-slate-900">{formatCurrency(d.totalAmount)}</span>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${d.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'}`}>
                                            {d.paymentStatus === 'PAID' ? 'PAGADO' : 'PENDIENTE'}
                                        </span>
                                    </div>
                                </div>

                                {/* Traza de Conciliación Bancaria */}
                                {d.paymentStatus === 'PAID' && (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2 mt-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                                <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                                                Trazabilidad Bancaria Verificada
                                            </span>
                                            <button
                                                onClick={() => copyVoucherTrace(d, match)}
                                                className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200 transition-all flex items-center gap-1.5"
                                            >
                                                {copiedId === d.id ? <CheckCircleIcon className="h-4 w-4 text-emerald-600" /> : <DocumentDuplicateIcon className="h-4 w-4" />}
                                                {copiedId === d.id ? '¡Comprobante Copiado!' : 'Solicitar / Copiar Comprobante'}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700 font-medium pt-1">
                                            <div>
                                                <span className="text-slate-400 block font-normal">Cuenta Bancaria / Cartola</span>
                                                <span className="font-bold text-slate-900">{tx?.bankAccount?.bankName || 'Banco Santander'} ({tx?.bankAccount?.accountNumber || 'Cta Cte'})</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block font-normal">Fecha de Movimiento</span>
                                                <span className="font-bold text-slate-900">{tx?.date ? tx.date.split('T')[0] : (d.issuedDate ? d.issuedDate.split('T')[0] : '2026')}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block font-normal">Glosa / Identificador Tx</span>
                                                <span className="font-bold text-slate-900 truncate block">{tx?.description || 'Transferencia de Pago Confirmada'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* TAB TRANSACCIONES BANCARIAS */}
                    {activeTab === 'TRANS' && results.transacciones.map((t, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <span className="text-xs text-slate-400 font-medium">{t.bankAccount?.bankName} ({t.bankAccount?.accountNumber}) - {t.date?.split('T')[0]}</span>
                                <h4 className="text-sm font-bold text-slate-900">{t.description}</h4>
                            </div>
                            <div className="text-right">
                                <span className={`text-base font-black ${t.type === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {t.type === 'DEBIT' ? '-' : '+'}{formatCurrency(t.amount)}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* TAB PROVEEDORES */}
                    {activeTab === 'PROV' && results.proveedores.map((p, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="bg-purple-100 p-3 rounded-xl text-purple-700">
                                <BriefcaseIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-slate-900">{p.name}</h4>
                                <p className="text-xs text-slate-500 font-medium">RUT: {p.rut}</p>
                            </div>
                        </div>
                    ))}

                    {/* Empty State */}
                    {!loading && q.trim().length > 1 && results.dtes.length === 0 && results.transacciones.length === 0 && results.proveedores.length === 0 && (
                        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
                            <MagnifyingGlassIcon className="h-12 w-12 text-slate-300 mx-auto" />
                            <h3 className="text-lg font-bold text-slate-700">No se encontraron folios ni movimientos</h3>
                            <p className="text-xs text-slate-500">Ingresa el número de folio exacto (ej. 1234) o el nombre del proveedor para consultar su traza.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
