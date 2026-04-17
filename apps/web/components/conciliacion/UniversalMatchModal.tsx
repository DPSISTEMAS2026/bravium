'use client';

import React, { useState, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, 
    XMarkIcon, 
    CheckCircleIcon, 
    ExclamationTriangleIcon,
    ArrowPathIcon,
    BanknotesIcon,
    HandThumbDownIcon,
    TrashIcon,
    PencilSquareIcon
} from '@heroicons/react/24/outline';
import { authFetch } from '../../lib/api';

interface UniversalMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    API_URL: string;
    onRefresh?: () => void;
    initialTransactions?: any[];
    initialDtes?: any[];
    suggestionId?: string;
    reviewMatchId?: string;
    matchStatus?: string;
    mode?: 'MANUAL' | 'SUGGESTION' | 'ANNOTATE' | 'REVIEW';
    onAnnotateSave?: (note: string, providerId?: string) => Promise<void>;
}

const formatCurrency = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
const formatDate = (s: string) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function UniversalMatchModal({
    isOpen,
    onClose,
    API_URL,
    onRefresh,
    initialTransactions = [],
    initialDtes = [],
    suggestionId,
    reviewMatchId,
    matchStatus,
    mode = 'MANUAL',
    onAnnotateSave,
}: UniversalMatchModalProps) {
    const [txSearch, setTxSearch] = useState('');
    const [dteSearch, setDteSearch] = useState('');
    const [pendingTxs, setPendingTxs] = useState<any[]>([]);
    const [unpaidDtes, setUnpaidDtes] = useState<any[]>([]);
    const [note, setNote] = useState('');
    
    const [selectedTxs, setSelectedTxs] = useState<any[]>(initialTransactions);
    const [selectedDtes, setSelectedDtes] = useState<any[]>(initialDtes);
    
    const [txLoading, setTxLoading] = useState(false);
    const [dteLoading, setDteLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Provider features
    const [providerSearch, setProviderSearch] = useState('');
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
    const [providerInfo, setProviderInfo] = useState<{ balance: number, unpaidNCs: any[], rawData?: any } | null>(null);
    const [isProviderLoading, setIsProviderLoading] = useState(false);
    
    // Unidirectional states
    const [boletaFolio, setBoletaFolio] = useState('');
    const [boletaAmount, setBoletaAmount] = useState<number | ''>('');

    useEffect(() => {
        if (isOpen) {
            let txs = [...(initialTransactions || [])];
            let dtes = [...(initialDtes || [])];

            // Auto-load related DTEs from initial txs
            txs.forEach(tx => {
                if (tx.matches?.length > 0) {
                    tx.matches.forEach((m: any) => {
                        if (m.status === 'CONFIRMED' && m.dte) {
                            if (!dtes.find(d => d.id === m.dte.id)) {
                                dtes.push({ ...m.dte, provider: m.dte.provider || (tx as any).provider });
                            }
                        }
                    });
                }
            });

            // Auto-load related Txs from initial (and expanded) dtes
            dtes.forEach(dte => {
                if (dte.matches?.length > 0) {
                    dte.matches.forEach((m: any) => {
                        if (m.status === 'CONFIRMED' && m.transaction) {
                            if (!txs.find(t => t.id === m.transaction.id)) {
                                txs.push(m.transaction);
                            }
                        }
                    });
                }
            });

            setSelectedTxs(txs);
            setSelectedDtes(dtes);
            setPendingTxs([]);
            setUnpaidDtes([]);
            setTxSearch('');
            setDteSearch('');
            setProviderResults([]);
            setProviderInfo(null);
            
            // Pre-populate existing annotation if opening in ANNOTATE mode
            const firstTx = txs[0];
            if (mode === 'ANNOTATE' && firstTx?.metadata?.reviewNote) {
                setNote(firstTx.metadata.reviewNote);
            } else {
                setNote('');
            }
            
            // Auto-detect provider: from initial DTEs or from existing annotation
            if (initialDtes && initialDtes.length > 0 && initialDtes[0].provider) {
                setSelectedProvider(initialDtes[0].provider);
            } else if (mode === 'ANNOTATE' && firstTx?.metadata?.providerName) {
                setSelectedProvider({ name: firstTx.metadata.providerName, id: firstTx.metadata.providerId });
                setProviderSearch(firstTx.metadata.providerName);
            } else {
                setSelectedProvider(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (selectedProvider) {
            fetchProviderInfo(selectedProvider.id);
        } else {
            setProviderInfo(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProvider]);

    if (!isOpen) return null;

    const fetchProviderInfo = async (providerId: string) => {
        setIsProviderLoading(true);
        try {
            // Get provider details for balance
            const resProv = await authFetch(`${API_URL}/proveedores/${providerId}`);
            const provData = await resProv.json();
            
            // Get unpaid NCs
            const resNC = await authFetch(`${API_URL}/dtes?providerId=${providerId}&type=61&paymentStatus=UNPAID&limit=5`);
            const ncData = await resNC.json();
            
            setProviderInfo({
                balance: provData?.currentBalance || provData?.favorableBalance || 0,
                unpaidNCs: Array.isArray(ncData) ? ncData : ncData.data || [],
                rawData: provData
            });
        } catch { /* ignore */ }
        finally { setIsProviderLoading(false); }
    };

    const searchProviders = async (q: string) => {
        if (q.length < 2) {
            setProviderResults([]);
            return;
        }
        try {
            const res = await authFetch(`${API_URL}/proveedores?search=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            setProviderResults(Array.isArray(data) ? data : data.data || []);
        } catch { /* ignore */ }
    };

    const searchTxs = async () => {
        if (!txSearch.trim()) return;
        setTxLoading(true);
        try {
            const params = new URLSearchParams({ search: txSearch, status: 'ALL', limit: '20' });
            const res = await authFetch(`${API_URL}/transactions?${params}`);
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
            const params = new URLSearchParams({ search: dteSearch, limit: '40', includeMatched: 'true' });
            const res = await authFetch(`${API_URL}/dtes?${params}`);
            if (res.ok) {
                const data = await res.json();
                setUnpaidDtes(Array.isArray(data) ? data : data.data || []);
            }
        } catch { /* ignore */ }
        finally { setDteLoading(false); }
    };

    const addTx = (tx: any) => {
        if (selectedTxs.find(t => t.id === tx.id)) return;
        
        let newTxs = [...selectedTxs, tx];
        let newDtes = [...selectedDtes];
        let dtesAdded = false;

        // Auto-load related DTEs if this transaction was already matched
        if (tx.matches?.length > 0) {
            tx.matches.forEach((m: any) => {
                if (m.status === 'CONFIRMED' && m.dte) {
                    if (!newDtes.find(d => d.id === m.dte.id)) {
                        newDtes.push({ ...m.dte, provider: m.dte.provider || (tx as any).provider });
                        dtesAdded = true;
                    }
                }
            });
        }
        
        setSelectedTxs(newTxs);
        if (dtesAdded) setSelectedDtes(newDtes);
    };
    const removeTx = (id: string) => setSelectedTxs(prev => prev.filter(t => t.id !== id));

    const addDte = (dte: any) => {
        if (selectedDtes.find(d => d.id === dte.id)) return;
        
        let newDtes = [...selectedDtes, dte];
        let newTxs = [...selectedTxs];
        let txsAdded = false;

        // Auto-load related Txs if this DTE was already matched
        if (dte.matches?.length > 0) {
            dte.matches.forEach((m: any) => {
                if (m.status === 'CONFIRMED' && m.transaction) {
                    if (!newTxs.find(t => t.id === m.transaction.id)) {
                        newTxs.push(m.transaction);
                        txsAdded = true;
                    }
                }
            });
        }
        
        setSelectedDtes(newDtes);
        if (txsAdded) setSelectedTxs(newTxs);
    };
    const removeDte = (id: string) => setSelectedDtes(prev => prev.filter(d => d.id !== id));

    const handleSave = async () => {
        // Unidirectional: DTEs but NO Txs (Manual Payment / Review)
        if (selectedDtes.length > 0 && selectedTxs.length === 0) {
            setIsSaving(true);
            try {
                for (const dte of selectedDtes) {
                    await authFetch(`${API_URL}/dtes/${dte.id}/review`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ note: note, status: 'PAID' })
                    });
                }
                if (onRefresh) onRefresh();
                onClose();
            } catch (err: any) {
                alert(`Error al guardar: ${err.message}`);
            } finally {
                setIsSaving(false);
            }
            return;
        }

        // Unidirectional: Txs but NO DTEs (Annotate / Create Boleta)
        if (selectedTxs.length > 0 && selectedDtes.length === 0) {
            setIsSaving(true);
            try {
                let finalDteIds: string[] = [];
                let finalNote = note;
                
                if (boletaFolio && Number(boletaFolio) > 0 && selectedProvider) {
                    const amount = boletaAmount || Math.abs(selectedTxs.reduce((s, t) => s + (t.amount || 0), 0));
                    const dteRes = await authFetch(`${API_URL}/dtes/honorarios`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            providerId: selectedProvider.id,
                            folio: Number(boletaFolio),
                            amount,
                            notes: note || undefined,
                            date: selectedTxs[0]?.date
                        })
                    });
                    
                    if (!dteRes.ok) {
                        const err = await dteRes.json().catch(()=>({}));
                        throw new Error(err.message || 'Error al crear la Boleta de Honorarios');
                    }
                    
                    const newDte = await dteRes.json();
                    finalDteIds.push(newDte.id);
                    finalNote = `[Boleta Honorarios Nº ${boletaFolio}] ${note}`.trim();
                }

                if (finalDteIds.length > 0) {
                    // Match with the new Boleta
                    const mRes = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            transactionIds: selectedTxs.map(t => t.id), 
                            dteIds: finalDteIds,
                            notes: finalNote || undefined
                        }),
                    });
                    if (!mRes.ok) throw new Error('Error al generar match manual con la boleta.');
                } else {
                    // Regular Annotate
                    if (onAnnotateSave) {
                        await onAnnotateSave(note, selectedProvider?.id);
                    } else {
                        for (const tx of selectedTxs) {
                            await authFetch(`${API_URL}/transactions/${tx.id}/review`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ note: note, providerId: selectedProvider?.id })
                            });
                        }
                    }
                }

                if (onRefresh) onRefresh();
                onClose();
            } catch (err: any) {
                alert(`Error: ${err.message}`);
            } finally {
                setIsSaving(false);
            }
            return;
        }

        // Bi-directional normal match
        if (selectedTxs.length === 0 || selectedDtes.length === 0) return;

        setIsSaving(true);
        try {
            const deletedMatches = new Set<string>();

            // Helper: delete a match, gracefully ignoring 404 (already deleted)
            const safeDeleteMatch = async (matchId: string) => {
                if (deletedMatches.has(matchId)) return;
                const delRes = await authFetch(`${API_URL}/conciliacion/matches/${matchId}`, { method: 'DELETE' });
                if (!delRes.ok && delRes.status !== 404) {
                    const errText = await delRes.text().catch(() => '');
                    throw new Error(`Error al liberar match ${matchId.slice(0,8)}: ${errText}`);
                }
                deletedMatches.add(matchId);
            };

            // Delete all existing matches from the selected DTEs
            for (const dte of selectedDtes) {
                const confirmedMatches = dte.matches?.filter((m: any) => m.status === 'CONFIRMED') || [];
                for (const match of confirmedMatches) {
                    await safeDeleteMatch(match.id);
                }
            }

            // Delete all existing matches from the selected Txs
            for (const tx of selectedTxs) {
                const confirmedMatches = tx.matches?.filter((m: any) => m.status === 'CONFIRMED') || [];
                for (const match of confirmedMatches) {
                    await safeDeleteMatch(match.id);
                }
            }

            let res;
            let isManualFallback = false;

            if (suggestionId) {
                res = await authFetch(`${API_URL}/conciliacion/suggestions/${suggestionId}/accept`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        overrides: {
                            transactionIds: selectedTxs.map(t => t.id),
                            dteIds: selectedDtes.map(d => d.id)
                        }
                    }),
                });

                // Si la sugerencia ya fue eliminada o borrada, hacemos un fallback silencioso a conciliación manual
                if (res.status === 404 || res.status === 400) {
                    const errorText = await res.text().catch(() => '');
                    if (errorText.includes('no encontrada') || errorText.includes('procesada') || res.status === 404) {
                        isManualFallback = true;
                    }
                }
            } else if (reviewMatchId) {
                res = await authFetch(`${API_URL}/conciliacion/matches/${reviewMatchId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'CONFIRMED' }),
                });

                // If notes were added/changed, optionally patch notes too
                if (res.ok && note) {
                    await authFetch(`${API_URL}/conciliacion/matches/${reviewMatchId}/notes`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes: note }),
                    });
                }
            } 
            
            // Si no habia sugerencia ni reviewMatchId, o la sugerencia original ya no existía (fallback manual)
            if ((!suggestionId && !reviewMatchId) || isManualFallback) {
                if (isManualFallback) {
                    console.log('Haciendo fallback a match manual porque la sugerencia ya no existe');
                }
                res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        transactionIds: selectedTxs.map(t => t.id).filter(Boolean), 
                        dteIds: selectedDtes.map(d => d.id).filter(Boolean),
                        notes: note || undefined
                    }),
                });
            }

            if (res.ok) {
                if (onRefresh) onRefresh();
                onClose();
            } else {
                const data = await res.json();
                alert(`Error: ${data.message || 'No se pudo guardar el match'}`);
            }
        } catch (err) {
            alert('Error de conexión');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRejectMatch = async () => {
        if (!reviewMatchId) return;
        if (!confirm('¿Estás seguro de rechazar esta sugerencia?')) return;
        
        setIsSaving(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/matches/${reviewMatchId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'REJECTED' })
            });
            if (res.ok) {
                if (onRefresh) onRefresh();
                onClose();
            }
        } catch { alert('Error de conexión'); }
        finally { setIsSaving(false); }
    };

    const handleRejectSuggestion = async () => {
        if (!suggestionId) return;
        if (!confirm('¿Estás seguro de rechazar esta sugerencia? No volverá a aparecer automáticamente.')) return;
        
        setIsSaving(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/suggestions/${suggestionId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'REJECTED' }),
            });
            if (res.ok) {
                if (onRefresh) onRefresh();
                onClose();
            }
        } catch { alert('Error de conexión'); }
        finally { setIsSaving(false); }
    };

    const handleDiscardMatch = async () => {
        if (selectedDtes.length === 0) return;
        const msg = selectedDtes.length === 1 
            ? '¿Estás seguro de eliminar este match? El documento y los movimientos volverán a estar pendientes.' 
            : '¿Estás seguro de eliminar los matches de estos documentos?';
            
        if (!confirm(msg)) return;
        
        setIsSaving(true);
        try {
            for (const dte of selectedDtes) {
                const confirmedMatch = dte.matches?.find((m: any) => m.status === 'CONFIRMED');
                if (confirmedMatch) {
                    await fetch(`${API_URL}/conciliacion/matches/${confirmedMatch.id}`, { method: 'DELETE' });
                }
            }
            if (onRefresh) onRefresh();
            onClose();
        } catch { alert('Error de conexión'); }
        finally { setIsSaving(false); }
    };

    const handleQuickTag = (tag: string) => {
        const tagStr = `[${tag}]`;
        if (note.includes(tagStr)) return;
        setNote(prev => prev ? `${tagStr} ${prev}` : tagStr);
    };

    const hasMatchedDtes = selectedDtes.some(dte => dte.hasMatch || (dte.matches && dte.matches.some((m: any) => m.status === 'CONFIRMED')));

    const totalTxs = selectedTxs.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
    
    let totalDtes = 0;
    selectedDtes.forEach(dte => {
        const isNC = dte.type === 61;
        const amount = Math.abs(dte.totalAmount || 0);
        if (isNC) totalDtes -= amount;
        else totalDtes += amount;
    });

    const diff = totalTxs - totalDtes;
    const isPerfect = diff === 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] overflow-hidden transition-all duration-300 ${selectedProvider ? 'max-w-[90vw] lg:max-w-7xl' : 'max-w-6xl'}`} onClick={e => e.stopPropagation()}>
                
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-800">Conciliación Universal</h2>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6 md:flex gap-8">
                    
                    <div className="flex-1 flex flex-col gap-4 border-r border-slate-100 pr-8">
                        {mode === 'ANNOTATE' && (
                            <div className="mb-2 bg-orange-50/80 border border-orange-100 rounded-lg p-4 space-y-4">
                                <div>
                                    <h4 className="text-sm font-bold text-orange-800 mb-2">Anotación Rápida</h4>
                                    <input 
                                        type="text" 
                                        value={note} 
                                        onChange={e => setNote(e.target.value)} 
                                        placeholder="Concepto / Motivo del gasto..." 
                                        className="w-full px-3 py-2 bg-white border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm shadow-sm"
                                    />
                                    <p className="text-[11px] text-orange-600 mt-2 font-medium flex items-center gap-1">
                                        <CheckCircleIcon className="h-3 w-3" /> Al presionar guardar, este movimiento se marcará como revisado.
                                    </p>
                                </div>

                                <div className="border-t border-orange-100 pt-3">
                                    <p className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1">
                                        <BanknotesIcon className="h-3.5 w-3.5" /> Asociar a Proveedor (Opcional)
                                    </p>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={providerSearch}
                                            onChange={e => {
                                                setProviderSearch(e.target.value);
                                                searchProviders(e.target.value);
                                                if (selectedProvider) setSelectedProvider(null);
                                            }}
                                            placeholder="Buscar proveedor..."
                                            className="w-full px-3 py-2 bg-white border border-orange-200 rounded-lg outline-none text-sm focus:ring-2 focus:ring-orange-500"
                                        />
                                        {providerResults.length > 0 && (
                                            <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                                                {providerResults.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => {
                                                            setSelectedProvider(p);
                                                            setProviderSearch(p.name);
                                                            setProviderResults([]);
                                                        }}
                                                        className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-50 last:border-b-0 text-sm"
                                                    >
                                                        <div className="font-semibold text-slate-700">{p.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">{p.rut}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {selectedProvider && (
                                        <div className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                            <CheckCircleIcon className="h-3.5 w-3.5" /> Proveedor Asociado: {selectedProvider.name}
                                        </div>
                                    )}
                                    {selectedProvider && (
                                        <div className="mt-4 pt-3 border-t border-orange-100/50">
                                            <p className="text-[11px] font-bold text-orange-800 mb-2">Generar Boleta de Honorarios (Opcional)</p>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="number"
                                                    value={boletaFolio}
                                                    onChange={e => setBoletaFolio(e.target.value)}
                                                    placeholder="N° Folio"
                                                    className="w-1/2 px-2 py-1.5 bg-white border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                                />
                                                <input 
                                                    type="number"
                                                    value={boletaAmount}
                                                    onChange={e => setBoletaAmount(Number(e.target.value) || '')}
                                                    placeholder="Monto (Opcional)"
                                                    className="w-1/2 px-2 py-1.5 bg-white border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500"
                                                />
                                            </div>
                                            <p className="text-[10px] text-orange-600 mt-1">Si ingresas un folio, se creará el DTE y quedará como pagado con este movimiento.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-700">Movimientos Bancarios</h3>
                            <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-xs font-semibold">{selectedTxs.length}</span>
                        </div>
                        
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={txSearch}
                                    onChange={e => setTxSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchTxs()}
                                    placeholder="Buscar glosa, fecha o monto..."
                                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                />
                            </div>
                            <button onClick={searchTxs} disabled={txLoading} className="px-4 py-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 font-medium text-sm transition-colors disabled:opacity-50">
                                Buscar
                            </button>
                        </div>

                        {pendingTxs.length > 0 && (
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 shadow-inner">
                                {pendingTxs.map(tx => {
                                    const isSelected = selectedTxs.some(t => t.id === tx.id);
                                    return (
                                        <button
                                            key={tx.id}
                                            disabled={isSelected}
                                            onClick={() => addTx(tx)}
                                            className={`w-full text-left px-4 py-2 text-sm flex justify-between items-center transition-colors ${isSelected ? 'bg-indigo-50/50 opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                                        >
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="font-medium text-slate-800 truncate">{tx.description}</div>
                                                <div className="text-xs text-slate-500">{formatDate(tx.date)}</div>
                                            </div>
                                            <div className="font-bold text-slate-900 whitespace-nowrap">{formatCurrency(tx.amount)}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="bg-indigo-50/30 border border-indigo-100 rounded-xl p-4 flex-1 flex flex-col">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-800 mb-3">Movimientos a conciliar</h4>
                            {selectedTxs.length === 0 ? (
                                <div className="text-center text-indigo-300 text-sm py-8 my-auto">Busca y selecciona movimientos arriba</div>
                            ) : (
                                <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                                    {selectedTxs.map(tx => (
                                        <div key={tx.id} className="bg-white border border-indigo-100 shadow-sm rounded-lg p-3 flex justify-between items-center group">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-slate-800 truncate">{tx.description}</div>
                                                <div className="text-xs text-slate-500">{formatDate(tx.date)}</div>
                                                {tx.metadata?.reviewNote && (
                                                    <div className="mt-1 flex items-center gap-1">
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 max-w-[220px] truncate" title={tx.metadata.reviewNote}>
                                                            💬 {tx.metadata.reviewNote}
                                                        </span>
                                                    </div>
                                                )}
                                                {tx.metadata?.providerName && (
                                                    <span className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 mt-0.5">
                                                        🏢 {tx.metadata.providerName}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-indigo-700">{formatCurrency(tx.amount)}</span>
                                                <button onClick={() => removeTx(tx.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <XMarkIcon className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="pt-4 border-t border-indigo-100 mt-4 flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-600">Total Bancario:</span>
                                <span className="text-lg font-black text-indigo-700">{formatCurrency(totalTxs)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-4 pl-0 mt-8 md:mt-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-700">Documentos / Facturas</h3>
                            <span className="bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 text-xs font-semibold">{selectedDtes.length}</span>
                        </div>

                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={dteSearch}
                                    onChange={e => setDteSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchDtes()}
                                    placeholder="Buscar folio, proveedor o monto..."
                                    className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                                />
                            </div>
                            <button onClick={searchDtes} disabled={dteLoading} className="px-4 py-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 font-medium text-sm transition-colors disabled:opacity-50">
                                Buscar
                            </button>
                        </div>

                        {unpaidDtes.length > 0 && (
                            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 shadow-inner">
                                {unpaidDtes.map(dte => {
                                    const isSelected = selectedDtes.some(d => d.id === dte.id);
                                    const isNC = dte.type === 61;
                                    const isMatched = dte.hasMatch || (dte.matches && dte.matches.some((m: any) => m.status === 'CONFIRMED'));
                                    return (
                                        <button
                                            key={dte.id}
                                            disabled={isSelected}
                                            onClick={() => addDte(dte)}
                                            className={`w-full text-left px-4 py-2 text-sm flex justify-between items-center transition-colors ${isSelected ? 'bg-emerald-50/50 opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                                        >
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="font-medium text-slate-800 flex items-center gap-2">
                                                    {isNC && <span className="bg-rose-100 text-rose-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">NC</span>}
                                                    {isMatched && <span className="bg-amber-100 text-amber-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Ocupado</span>}
                                                    <span className="truncate">{dte.provider?.name || 'Desconocido'}</span>
                                                </div>
                                                <div className="text-xs text-slate-500">Folio: {dte.folio} · {formatDate(dte.issuedDate)}</div>
                                            </div>
                                            <div className={`font-bold whitespace-nowrap ${isNC ? 'text-rose-600' : 'text-slate-900'}`}>
                                                {isNC ? '-' : ''}{formatCurrency(dte.totalAmount)}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 flex-1 flex flex-col">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-3">Documentos a conciliar</h4>
                            {selectedDtes.length === 0 ? (
                                <div className="text-center text-emerald-300 text-sm py-8 my-auto">Busca y selecciona documentos arriba</div>
                            ) : (
                                <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                                {selectedDtes.map(dte => {
                                        const isNC = dte.type === 61;
                                        const isMatched = dte.hasMatch || (dte.matches && dte.matches.some((m: any) => m.status === 'CONFIRMED'));
                                        return (
                                            <div key={dte.id} className={`border shadow-sm rounded-lg p-3 flex justify-between items-center group ${isMatched ? 'bg-amber-50 border-amber-200' : 'bg-white border-emerald-100'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-semibold text-slate-800">
                                                        {isNC && <span className="text-rose-500 mr-2 text-xs font-bold">[NC]</span>}
                                                        {dte.provider?.name || 'Sin Proveedor'}
                                                    </div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-2">
                                                        Folio: {dte.folio} · {formatDate(dte.issuedDate)}
                                                        {isMatched && <span className="text-amber-600 font-bold">⚠️ Reasignará vínculo</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className={`font-bold ${isNC ? 'text-rose-600' : 'text-emerald-700'}`}>
                                                        {isNC ? '-' : ''}{formatCurrency(dte.totalAmount)}
                                                    </span>
                                                    <button onClick={() => removeDte(dte.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <XMarkIcon className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="pt-4 border-t border-emerald-100 mt-4 flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-600">Total Documentos:</span>
                                <span className="text-lg font-black text-emerald-700 cursor-help" title="Descuenta Notas de Crédito automáticamente">{formatCurrency(totalDtes)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Historical Provider Panel */}
                    {selectedProvider && providerInfo && (
                        <div className="hidden lg:flex w-72 flex-col gap-4 border-l border-slate-100 pl-6 shrink-0">
                            <h3 className="text-sm font-bold text-slate-700 mb-2">Historial del Proveedor</h3>
                            {isProviderLoading ? (
                                <div className="text-xs text-slate-400">Cargando...</div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Folios Pendientes */}
                                    <div className="p-4 bg-white border border-rose-200 rounded-xl shadow-sm">
                                        <div className="text-[10px] flex items-center gap-1 uppercase font-bold text-rose-500 mb-3">
                                            <BanknotesIcon className="w-3 h-3"/> Folios Pendientes
                                        </div>
                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                            {providerInfo?.rawData?.dtes?.filter((d: any) => d.outstandingAmount > 0 && new Date(d.issuedDate).getFullYear() >= 2026).length > 0 ? (
                                                providerInfo.rawData.dtes
                                                    .filter((d: any) => d.outstandingAmount > 0 && new Date(d.issuedDate).getFullYear() >= 2026)
                                                    .map((dte: any) => (
                                                    <div key={dte.id} className="text-[11px] flex justify-between items-center border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-700">Folio: {dte.folio}</span>
                                                            <span className="text-slate-400 font-mono text-[9px]">{formatDate(dte.issuedDate)}</span>
                                                        </div>
                                                        <span className="font-bold text-rose-600">{formatCurrency(dte.outstandingAmount)}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[11px] text-slate-400">Sin facturas pendientes este año</div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Folios Pagados */}
                                    <div className="p-4 bg-white border border-emerald-200 rounded-xl shadow-sm">
                                        <div className="text-[10px] flex items-center gap-1 uppercase font-bold text-emerald-600 mb-3">
                                            <BanknotesIcon className="w-3 h-3"/> Folios Pagados
                                        </div>
                                        <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                            {providerInfo?.rawData?.dtes?.filter((d: any) => d.outstandingAmount <= 0 && new Date(d.issuedDate).getFullYear() >= 2026).length > 0 ? (
                                                providerInfo.rawData.dtes
                                                    .filter((d: any) => d.outstandingAmount <= 0 && new Date(d.issuedDate).getFullYear() >= 2026)
                                                    .slice(0, 10) // Show last 10 paid max
                                                    .map((dte: any) => (
                                                    <div key={dte.id} className="text-[11px] flex justify-between items-center border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-700">Folio: {dte.folio}</span>
                                                            <span className="text-slate-400 font-mono text-[9px]">{formatDate(dte.issuedDate)}</span>
                                                        </div>
                                                        <span className="font-bold text-emerald-700">{formatCurrency(dte.totalAmount)}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[11px] text-slate-400">Sin pagos recientes este año</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-5 flex items-center justify-between">
                    
                    <div className="flex-1">
                        {selectedTxs.length > 0 && selectedDtes.length > 0 && (
                            <div className="flex items-center gap-4">
                                {isPerfect ? (
                                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-100/50 px-4 py-2 rounded-lg border border-emerald-200">
                                        <CheckCircleIcon className="h-6 w-6" />
                                        <div>
                                            <div className="font-bold text-sm">Cuadratura Perfecta</div>
                                            <div className="text-xs text-emerald-700 opacity-80">No hay diferencia de montos.</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${diff > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                        <ExclamationTriangleIcon className="h-6 w-6" />
                                        <div>
                                            <div className="font-bold text-sm">Diferencia: {formatCurrency(Math.abs(diff))}</div>
                                            <div className="text-xs opacity-80">
                                                {diff > 0 
                                                    ? 'Monto del banco superior (Excedente)' 
                                                    : 'Monto de facturas superior (Saldo pendiente)'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="flex-1 max-w-[400px]">
                                    <div className="flex flex-wrap gap-1 mb-1.5">
                                        {['NC', 'Pago Parcial', 'Dif. Cambio', 'Redondeo'].map(tag => (
                                            <button 
                                                key={tag}
                                                type="button"
                                                onClick={() => handleQuickTag(tag)}
                                                className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200 transition-colors"
                                            >
                                                + {tag}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="relative">
                                        <PencilSquareIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            value={note}
                                            onChange={e => setNote(e.target.value)}
                                            placeholder="Notas de conciliación..."
                                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {providerInfo && (
                            <div className="mt-3 flex items-center gap-4">
                                {providerInfo.balance < 0 ? (
                                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-100/50 border border-emerald-200 px-3 py-1.5 rounded-lg text-[11px] animate-pulse">
                                        <BanknotesIcon className="h-4 w-4" />
                                        <span className="font-bold">Saldo a favor del Proveedor: {formatCurrency(Math.abs(providerInfo.balance))}</span>
                                    </div>
                                ) : providerInfo.balance > 0 ? (
                                    <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-[11px]">
                                        <BanknotesIcon className="h-4 w-4" />
                                        <span className="font-bold">Deuda pendiente: {formatCurrency(providerInfo.balance)}</span>
                                    </div>
                                ) : null}

                                {providerInfo.unpaidNCs.length > 0 && (
                                    <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg text-[11px]">
                                        <span className="font-bold">NCs Disponibles:</span>
                                        <div className="flex gap-1">
                                            {providerInfo.unpaidNCs.map(nc => (
                                                <button 
                                                    key={nc.id}
                                                    onClick={() => addDte(nc)}
                                                    className="bg-white border border-indigo-200 hover:border-indigo-500 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors shadow-sm"
                                                    title={`Haz clic para agregar la NC #${nc.folio}`}
                                                >
                                                    #{nc.folio} ({formatCurrency(nc.totalAmount)})
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">
                            Cancelar
                        </button>
                        
                        {(suggestionId || mode === 'SUGGESTION' || (mode === 'REVIEW' && matchStatus === 'SUGGESTED')) && (
                            <button 
                                onClick={reviewMatchId ? handleRejectMatch : handleRejectSuggestion}
                                disabled={isSaving}
                                className="px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 border-2 border-rose-100 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <HandThumbDownIcon className="h-4 w-4" /> Rechazar Sugerencia
                            </button>
                        )}

                        {((mode === 'REVIEW' && matchStatus === 'CONFIRMED') || initialDtes.some(d => d.hasMatch)) && (
                            <button 
                                onClick={handleDiscardMatch}
                                disabled={isSaving}
                                className="px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 border-2 border-red-100 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                <TrashIcon className="h-4 w-4" /> Descartar Match
                            </button>
                        )}

                        <button 
                            onClick={handleSave} 
                            disabled={(selectedTxs.length === 0 && mode !== 'ANNOTATE') || (selectedDtes.length === 0 && mode !== 'ANNOTATE') || isSaving}
                            className={`px-6 py-2.5 text-sm font-bold text-white shadow-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${hasMatchedDtes ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20' : isPerfect ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}`}
                        >
                            {isSaving ? 'Guardando...' : 
                             hasMatchedDtes ? 'Confirmar y Reasignar' :
                             mode === 'ANNOTATE' && selectedDtes.length === 0 ? 'Marcar como Revisado' :
                             isPerfect ? 'Confirmar Cuadratura' : 'Forzar Conciliación Parcial'}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
