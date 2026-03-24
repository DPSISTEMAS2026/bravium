'use client';

import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon, BriefcaseIcon, DocumentTextIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { getApiUrl } from '../../../lib/api';

interface SearchResult {
    proveedores: any[];
    dtes: any[];
    transacciones: any[];
}

export default function MobileSearchPage() {
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<SearchResult>({ proveedores: [], dtes: [], transacciones: [] });
    const [activeTab, setActiveTab] = useState<'TRANS' | 'DTES' | 'PROV'>('TRANS');
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const API_URL = getApiUrl();

    useEffect(() => {
        if (q.trim().length <= 1) {
            setResults({ proveedores: [], dtes: [], transacciones: [] });
            return;
        }

        const debounce = setTimeout(() => {
            fetchResults();
        }, 500);

        return () => clearTimeout(debounce);
    }, [q]);

    const fetchResults = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('bravium_token');
            const res = await fetch(`${API_URL}/search/global?q=${q.trim()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                console.error('Fetch error:', res.statusText);
                setResults({ proveedores: [], dtes: [], transacciones: [] });
                return;
            }

            const data = await res.json();
            setResults(data || { proveedores: [], dtes: [], transacciones: [] });
        } catch (err) {
            console.error('Error fetching global search:', err);
            setResults({ proveedores: [], dtes: [], transacciones: [] });
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    return (
        <div className="min-h-screen bg-slate-50 md:hidden p-4">
            <div className="mb-4">
                <h1 className="text-xl font-bold text-slate-900">Búsqueda Global</h1>
                <p className="text-xs text-slate-500">Consulta cualquier dato en el sistema</p>
            </div>

            {/* Barra de Búsqueda */}
            <div className="relative mb-4">
                <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar proveedor, factura, monto, etc..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-all"
                />
                {loading && <ArrowPathIcon className="h-4 w-4 absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-600 animate-spin" />}
            </div>

            {/* Tabs de Filtro */}
            <div className="flex space-x-2 mb-4 overflow-x-auto pb-1">
                <button
                    onClick={() => setActiveTab('TRANS')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'TRANS' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
                >
                    Movimientos ({results.transacciones.length})
                </button>
                <button
                    onClick={() => setActiveTab('DTES')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'DTES' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
                >
                    Facturas ({results.dtes.length})
                </button>
                <button
                    onClick={() => setActiveTab('PROV')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeTab === 'PROV' ? 'bg-purple-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'}`}
                >
                    Proveedores ({results.proveedores.length})
                </button>
            </div>

            {/* Lista de Resultados */}
            <div className="space-y-3">
                {activeTab === 'TRANS' && results.transacciones.map((t, idx) => {
                    const id = `t-${idx}`;
                    const isExpanded = expandedItemId === id;
                    return (
                        <div 
                            key={idx} 
                            onClick={() => setExpandedItemId(isExpanded ? null : id)}
                            className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm transition-all"
                        >
                            <div className="flex justify-between items-center">
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-500 font-medium">{t.bankAccount?.bankName} - {t.date.split('T')[0]}</p>
                                    <p className="text-sm font-bold text-slate-900 truncate">{t.description}</p>
                                </div>
                                <div className={`text-sm font-bold ${t.type === 'DEBIT' ? 'text-red-500' : 'text-green-500'} shrink-0`}>
                                    {t.type === 'DEBIT' ? '-' : '+'}{formatCurrency(t.amount)}
                                </div>
                            </div>
                            
                            {t.matches && t.matches.length > 0 && (
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg w-max border border-emerald-100">
                                    🔗 Conciliado con Folio {t.matches[0].dte?.folio}
                                </div>
                            )}

                            {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-lg">
                                    <p><strong>Detalle completo:</strong> {t.description}</p>
                                    <p><strong>Referencia:</strong> {t.reference || 'Sin referencia'}</p>
                                    <p><strong>Cartola Original:</strong> {t.metadata?.sourceFile || 'Sin archivo vinculado'}</p>
                                    {t.matches && t.matches[0]?.dte && (
                                        <div className="mt-2 p-2 bg-white rounded border border-slate-100">
                                            <p className="font-bold text-emerald-700 text-xs mb-1">Factura Asociada:</p>
                                            <p><strong>Folio:</strong> {t.matches[0].dte.folio}</p>
                                            <p><strong>Total:</strong> {formatCurrency(t.matches[0].dte.totalAmount)}</p>
                                            <p><strong>RUT Emisor:</strong> {t.matches[0].dte.rutIssuer}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {activeTab === 'DTES' && results.dtes.map((d, idx) => {
                    const id = `d-${idx}`;
                    const isExpanded = expandedItemId === id;
                    return (
                        <div 
                            key={idx} 
                            onClick={() => setExpandedItemId(isExpanded ? null : id)}
                            className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm transition-all"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <p className="text-xs text-slate-500">Folio: <span className="font-bold text-slate-800">{d.folio || 'N/A'}</span></p>
                                    <p className="text-xs font-medium text-slate-400">{d.rutIssuer}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${d.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {d.paymentStatus}
                                </span>
                            </div>
                            <p className="text-sm font-bold text-slate-900 truncate mb-1">{d.provider?.name || 'S/Proveedor'}</p>
                            <p className="text-sm font-black text-purple-600 text-right">{formatCurrency(d.totalAmount)}</p>
                            
                            {d.matches && d.matches.length > 0 && (
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg w-max border border-emerald-100">
                                    🔗 Pagado con movimiento
                                </div>
                            )}

                            {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-lg">
                                    <p><strong>Proveedor:</strong> {d.provider?.name || 'Desconocido'}</p>
                                    <p><strong>RUT:</strong> {d.rutIssuer}</p>
                                    <p><strong>Fecha Emisión:</strong> {d.issuedDate?.split('T')[0]}</p>
                                    {d.matches && d.matches[0]?.transaction && (
                                        <div className="mt-2 p-2 bg-white rounded border border-slate-100">
                                            <p className="font-bold text-emerald-700 text-xs mb-1">Movimiento de pago:</p>
                                            <p><strong>Descripción:</strong> {d.matches[0].transaction.description}</p>
                                            <p><strong>Monto:</strong> {formatCurrency(d.matches[0].transaction.amount)}</p>
                                            <p><strong>Cartola Original:</strong> {d.matches[0].transaction.metadata?.sourceFile || 'Sin archivo vinculado'}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {activeTab === 'PROV' && results.proveedores.map((p, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
                        <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
                            <BriefcaseIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-400">{p.rut}</p>
                        </div>
                    </div>
                ))}

                {/* Mensaje de vacío */}
                {!loading && q.trim().length > 1 && results.proveedores.length === 0 && results.dtes.length === 0 && results.transacciones.length === 0 && (
                    <div className="text-center py-8">
                        <MagnifyingGlassIcon className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm font-medium text-slate-500">No encontramos resultados</p>
                        <p className="text-xs text-slate-400">Prueba con otra palabra o monto</p>
                    </div>
                )}
            </div>

            {/* Bloqueador de Escritorio */}
            <div className="hidden md:flex min-h-[400px] flex-col items-center justify-center p-8 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl text-center">
                <MagnifyingGlassIcon className="h-10 w-10 text-slate-400 mb-3" />
                <h3 className="text-lg font-semibold text-slate-700">Módulo exclusivo para Móviles</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">Este super-buscador está diseñado para consultas veloces desde tu celular. Para usarlo, accede desde tu smartphone.</p>
            </div>
        </div>
    );
}
