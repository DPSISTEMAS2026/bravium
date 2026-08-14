'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    MagnifyingGlassIcon, 
    XMarkIcon, 
    CheckCircleIcon, 
    ExclamationTriangleIcon,
    ArrowPathIcon,
    BanknotesIcon,
    HandThumbDownIcon,
    TrashIcon,
    PencilSquareIcon,
    DocumentTextIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
import { authFetch, apiFetcher } from '../../lib/api';
import useSWR from 'swr';

interface UniversalMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    API_URL: string;
    onRefresh?: () => void;
    initialTransactions?: any[];
    initialDtes?: any[];
    provider?: any;
    suggestionId?: string;
    reviewMatchId?: string;
    matchStatus?: string;
    mode?: 'MANUAL' | 'SUGGESTION' | 'ANNOTATE' | 'REVIEW';
    onAnnotateSave?: (note: string, providerId?: string, ruleId?: string) => Promise<void>;
}

const formatCurrency = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
const formatDate = (s: any) => {
    if (!s || s === 'Invalid Date') return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function extractPersonNameFromGlosa(desc: string): string | null {
    let s = String(desc || '');
    s = s.replace(/^0?\d{8,11}\s*/i, '');
    s = s.replace(/^Transf\.?\s*(Internet\s*)?a\s*/i, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || /\b(SPA|LTDA|S\.?A\.?|LIMITADA|EIRL)\b/i.test(s)) return null;
    if (/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/i.test(s)) return null;
    const words = s.split(' ').filter(w => /[a-záéíóúñü]/i.test(w));
    if (words.length >= 2 && words.length <= 5) return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return null;
}

function looksLikeHonorarios(tx: any, provider: any): boolean {
    const cat = String(provider?.category || tx?.metadata?.category || '').toUpperCase();
    if (cat.includes('HONOR')) return true;
    const desc = String(tx?.description || '');
    const blob = `${provider?.name || ''} ${tx?.metadata?.identifiedProviderName || ''} ${desc}`;
    if (/honorario/i.test(blob)) return true;
    if (/MP\s*\*|MERCADOPAGO|WEBPAY|TRANSBANK|PAYPAL|RIPLEY|FALABELLA|LIDER|PARIS|TRASPASO|COMISION|IMPUESTO|MUNICIPALIDAD|CHILEXPRESS/i.test(blob)) return false;
    if (/\b(SPA|LTDA|S\.?A\.?|LIMITADA|EIRL|CORPORATION|ROBOTICS|BANCO)\b/i.test(blob)) return false;
    if (!/^Transf/i.test(desc)) return false;
    const person = provider?.name || tx?.metadata?.identifiedProviderName || extractPersonNameFromGlosa(desc);
    const words = String(person || '').trim().split(/\s+/).filter(Boolean);
    return words.length >= 2 && words.length <= 5;
}

export function UniversalMatchModal({
    isOpen,
    onClose,
    API_URL,
    onRefresh,
    initialTransactions = [],
    initialDtes = [],
    provider,
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
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Provider features
    const [providerSearch, setProviderSearch] = useState('');
    const [providerResults, setProviderResults] = useState<any[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
    const [providerInfo, setProviderInfo] = useState<{ balance: number, unpaidNCs: any[], rawData?: any } | null>(null);
    const [isProviderLoading, setIsProviderLoading] = useState(false);
    
    // Unidirectional states
    const [boletaFolio, setBoletaFolio] = useState('');
    const [boletaAmount, setBoletaAmount] = useState<number | ''>('');
    const [boletaKind, setBoletaKind] = useState<39 | 112>(112);
    const [honorariosName, setHonorariosName] = useState('');
    
    // New states for Gastos Fijos & Diff Resolution
    const [selectedRuleId, setSelectedRuleId] = useState<string>('');
    const [diffResolution, setDiffResolution] = useState<'PARTIAL' | 'EXACT' | null>(null);

    const { data: rules = [] } = useSWR(isOpen ? `${API_URL}/conciliacion/rules` : null, apiFetcher);

    // Ref para cancelar setTimeout de auto-search si el modal se cierra rápido
    const autoSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clave serializada para detectar cambios en las props iniciales sin causar re-renders innecesarios
    const initKey = useMemo(() => {
        const txIds = (initialTransactions || []).map((t: any) => t.id).sort().join(',');
        const dteIds = (initialDtes || []).map((d: any) => d.id).sort().join(',');
        return `${txIds}|${dteIds}`;
    }, [initialTransactions, initialDtes]);

    useEffect(() => {
        // Limpiar cualquier auto-search pendiente de una apertura anterior
        if (autoSearchTimerRef.current) {
            clearTimeout(autoSearchTimerRef.current);
            autoSearchTimerRef.current = null;
        }

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            const txs = [...(initialTransactions || [])];
            const dtes = [...(initialDtes || [])];

            setSelectedTxs(txs);
            setSelectedDtes(dtes);
            setPendingTxs([]);
            setUnpaidDtes([]);
            setProviderResults([]);
            setProviderInfo(null);
            setSelectedRuleId('');
            setDiffResolution(null);
            setSaveSuccess(false);
            setSaveError(null);
            setBoletaFolio('');
            setBoletaKind(112);
            const txAmt = Math.abs(txs.reduce((s, t) => s + Number(t.amount || 0), 0));
            setBoletaAmount(txAmt || '');
            
            // Pre-populate existing annotation if opening in ANNOTATE mode
            const firstTx = txs[0];
            if (mode === 'ANNOTATE' && firstTx?.metadata?.reviewNote) {
                setNote(firstTx.metadata.reviewNote);
            } else {
                setNote('');
            }
            
            // Auto-detect provider & RUT from description or provider prop
            const detectedProv = provider || (initialDtes && initialDtes[0]?.provider) || (firstTx?.provider) || null;
            let autoQuery = '';

            if (detectedProv) {
                setSelectedProvider(detectedProv);
                autoQuery = detectedProv.name || detectedProv.rut || '';
            } else if (firstTx?.description) {
                let desc = firstTx.description;
                
                // Extract clean provider name or RUT
                let cleanedName = desc
                    .replace(/^0?\d{8,11}\s*/i, '') // strip leading 0995353709
                    .replace(/^Transf\.\s*Internet\s*a\s*/i, '')
                    .replace(/^Transf\s*a\s*/i, '')
                    .replace(/^PAGO\s*PROVEEDOR\s*/i, '')
                    .replace(/^ABN\s*CRD\s*DB\s*TRAN\s*/i, '')
                    .replace(/TRANSBA$/i, '')
                    .replace(/\$\s*[\d\.\s]+$/i, '')
                    .trim();

                const rutMatch = desc.match(/(\d{1,2}\.?\d{3}\.?\d{3}[-kK0-9])/);
                if (rutMatch) {
                    const cleanRut = rutMatch[1].replace(/[^0-9kK]/g, '').toUpperCase();
                    const trimmedRut = cleanRut.length === 9 && cleanRut.startsWith('0') ? cleanRut.substring(1) : cleanRut;
                    // Prefer cleaned provider name if >=3 chars, otherwise use RUT
                    autoQuery = cleanedName.length >= 3 ? cleanedName : trimmedRut;
                } else {
                    autoQuery = cleanedName || desc;
                }
            }

            if (autoQuery) {
                setDteSearch(autoQuery);
                setTxSearch(autoQuery);
                autoSearchTimerRef.current = setTimeout(() => {
                    searchDtes(autoQuery);
                    searchTxs(autoQuery);
                }, 100);
            } else {
                setDteSearch('');
                setTxSearch('');
            }

            const personFromGlosa = extractPersonNameFromGlosa(firstTx?.description || '');
            const honorName = detectedProv?.name || firstTx?.metadata?.identifiedProviderName || personFromGlosa || '';
            setHonorariosName(honorName);
            const honorarios = looksLikeHonorarios(firstTx, detectedProv);
            if (honorarios && honorName) {
                searchProviders(honorName, true);
            }
        }

        return () => {
            document.body.style.overflow = '';
            document.body.style.overflowY = '';
            document.documentElement.style.overflow = '';
            document.documentElement.style.overflowY = '';
        };
    }, [isOpen, initKey]);

    useEffect(() => {
        if (selectedProvider) {
            fetchProviderInfo(selectedProvider.id);
        } else {
            setProviderInfo(null);
        }
         
    }, [selectedProvider]);

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

    const searchProviders = async (q: string, autoSelect = false) => {
        if (q.length < 2) {
            setProviderResults([]);
            return;
        }
        try {
            const res = await authFetch(`${API_URL}/proveedores?search=${encodeURIComponent(q)}&limit=10`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.data || [];
            setProviderResults(list);
            if (autoSelect && list.length > 0) {
                const qn = q.trim().toLowerCase();
                const exact = list.find((p: any) => String(p.name || '').trim().toLowerCase() === qn)
                    || list.find((p: any) => String(p.name || '').toLowerCase().includes(qn.split(' ')[0]))
                    || list[0];
                setSelectedProvider(exact);
                setHonorariosName(exact.name || q);
            }
        } catch { /* ignore */ }
    };

    const searchTxs = async (overrideQuery?: string) => {
        const q = (overrideQuery !== undefined ? overrideQuery : txSearch).trim();
        if (!q) return;
        setTxLoading(true);
        try {
            const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const params = new URLSearchParams({ search: q, status: 'ALL', limit: '50', fromDate: sixMonthsAgo.toISOString().split('T')[0], sortBy: 'date', order: 'desc' });
            const res = await authFetch(`${API_URL}/transactions?${params}`);
            if (res.ok) {
                const data = await res.json();
                const arr = Array.isArray(data) ? data : data.data || [];
                setPendingTxs(arr);
            }
        } catch { /* ignore */ }
        finally { setTxLoading(false); }
    };

    const searchDtes = async (overrideQuery?: string) => {
        const q = (overrideQuery !== undefined ? overrideQuery : dteSearch).trim();
        if (!q) return;
        setDteLoading(true);
        try {
            const params = new URLSearchParams({ search: q, limit: '40', includeMatched: 'true' });
            const res = await authFetch(`${API_URL}/dtes?${params}`);
            if (res.ok) {
                const data = await res.json();
                const arr = Array.isArray(data) ? data : data.data || [];
                setUnpaidDtes(arr);
            }
        } catch { /* ignore */ }
        finally { setDteLoading(false); }
    };

    const addTx = (tx: any) => {
        if (selectedTxs.find(t => t.id === tx.id)) return;
        
        const newTxs = [...selectedTxs, tx];
        const newDtes = [...selectedDtes];
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

    const editDteAmount = async (dteId: string, currentAmount: number) => {
        const raw = window.prompt(`Corregir monto bruto del documento:`, currentAmount.toString());
        if (!raw) return;
        const newAmount = parseInt(raw.replace(/\D/g, ''), 10);
        if (isNaN(newAmount) || newAmount <= 0 || newAmount === currentAmount) return;

        setIsSaving(true);
        try {
            const res = await authFetch(`${API_URL}/dtes/${dteId}/amount`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: newAmount })
            });

            if (res.ok) {
                setSelectedDtes(prev => prev.map(d => d.id === dteId ? { ...d, totalAmount: newAmount, outstandingAmount: newAmount } : d));
                // Optionally update unpaidDtes if present
                setUnpaidDtes(prev => prev.map(d => d.id === dteId ? { ...d, totalAmount: newAmount, outstandingAmount: newAmount } : d));
            } else {
                throw new Error('No se pudo actualizar el monto.');
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const removeTx = (id: string) => setSelectedTxs(prev => prev.filter(t => t.id !== id));

    const addDte = (dte: any) => {
        if (selectedDtes.find(d => d.id === dte.id)) return;
        
        const newDtes = [...selectedDtes, dte];
        const newTxs = [...selectedTxs];
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
        if (dte.provider && dte.provider.id !== selectedProvider?.id) {
            setSelectedProvider(dte.provider);
        }
    };
    const removeDte = (id: string) => setSelectedDtes(prev => prev.filter(d => d.id !== id));

    const handleSave = async (actionOverride?: 'PARTIAL' | 'EXACT') => {
        setSaveError(null);
        setSaveSuccess(false);

        // Helper to complete save successfully
        const completeSuccess = () => {
            setSaveSuccess(true);
            setTimeout(() => {
                if (onRefresh) onRefresh();
                onClose();
            }, 600);
        };

        // Unidirectional: DTEs but NO Txs (Manual Payment / Review)
        if (selectedDtes.length > 0 && selectedTxs.length === 0) {
            setIsSaving(true);
            try {
                for (const dte of selectedDtes) {
                    await authFetch(`${API_URL}/dtes/${dte.id}/review`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            note: note, 
                            status: 'PAID',
                            ruleId: selectedRuleId || undefined 
                        })
                    });
                }
                completeSuccess();
            } catch (err: any) {
                setSaveError(`Error al guardar: ${err.message}`);
            } finally {
                setIsSaving(false);
            }
            return;
        }

        // Unidirectional: Txs but NO DTEs (Annotate / Create Boleta)
        if (selectedTxs.length > 0 && selectedDtes.length === 0) {
            setIsSaving(true);
            try {
                const finalDteIds: string[] = [];
                let finalNote = note;
                
                if (boletaFolio && Number(boletaFolio) > 0 && (selectedProvider || honorariosName)) {
                    const amount = boletaAmount || Math.abs(selectedTxs.reduce((s, t) => s + (t.amount || 0), 0));
                    const dteRes = await authFetch(`${API_URL}/dtes/honorarios`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            providerId: selectedProvider?.id,
                            providerName: honorariosName || selectedProvider?.name,
                            providerRut: selectedProvider?.rut,
                            folio: Number(boletaFolio),
                            amount,
                            notes: note || undefined,
                            date: selectedTxs[0]?.date,
                            type: boletaKind,
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
                        await onAnnotateSave(note, selectedProvider?.id, selectedRuleId || undefined);
                    } else {
                        for (const tx of selectedTxs) {
                            await authFetch(`${API_URL}/transactions/${tx.id}/review`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ note: note, providerId: selectedProvider?.id, ruleId: selectedRuleId || undefined })
                            });
                        }
                    }
                }

                completeSuccess();
            } catch (err: any) {
                setSaveError(`Error: ${err.message}`);
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
                if (matchId === reviewMatchId) return; 
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

            if (suggestionId && actionOverride !== 'PARTIAL') {
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

                if (res.status === 404 || res.status === 400) {
                    const errorText = await res.text().catch(() => '');
                    if (errorText.includes('no encontrada') || errorText.includes('procesada') || res.status === 404) {
                        isManualFallback = true;
                    }
                }
            } else if (reviewMatchId && actionOverride !== 'PARTIAL') {
                res = await authFetch(`${API_URL}/conciliacion/matches/${reviewMatchId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'CONFIRMED' }),
                });

                if (res.ok && note) {
                    await authFetch(`${API_URL}/conciliacion/matches/${reviewMatchId}/notes`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ notes: note }),
                    });
                }
            } 
            
            if ((!suggestionId && !reviewMatchId) || isManualFallback || actionOverride === 'PARTIAL') {
                res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        transactionIds: selectedTxs.map(t => t.id).filter(Boolean), 
                        dteIds: selectedDtes.map(d => d.id).filter(Boolean),
                        notes: note || undefined,
                        action: diffResolution || actionOverride || 'EXACT'
                    }),
                });
            }

            if (res && res.ok) {
                completeSuccess();
            } else if (res) {
                const data = await res.json().catch(()=>({}));
                setSaveError(`Error: ${data.message || 'No se pudo guardar el match'}`);
            } else {
                setSaveError('Error inesperado procesando la orden');
            }
        } catch (err: any) {
            setSaveError(`Error de conexión: ${err.message || ''}`);
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
                setSelectedDtes([]);
                onClose();
            } else {
                alert('Error al rechazar sugerencia');
            }
        } catch { alert('Error de conexión'); }
        finally { setIsSaving(false); }
    };

    const handleRejectSuggestion = async () => {
        if (!suggestionId) return;
        if (!confirm('¿Estás seguro de rechazar esta sugerencia? No volverá a aparecer automáticamente.')) return;
        
        setIsSaving(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/suggestions/${suggestionId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Rechazado por el usuario' }),
            });
            if (res.ok) {
                if (onRefresh) onRefresh();
                setSelectedDtes([]);
                onClose();
            } else {
                alert('Error al rechazar sugerencia');
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
                    const delRes = await authFetch(`${API_URL}/conciliacion/matches/${confirmedMatch.id}`, { method: 'DELETE' });
                    if (!delRes.ok && delRes.status !== 404) {
                        const errText = await delRes.text().catch(() => '');
                        throw new Error(`Error al eliminar match: ${errText}`);
                    }
                }
            }
            if (onRefresh) onRefresh();
            onClose();
        } catch (err: any) { alert(err?.message || 'Error de conexión'); }
        finally { setIsSaving(false); }
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

    // Extrae SOLO el cuerpo numérico del RUT (sin DV). Ej: "76.376.508-3" → "76376508", "76376508" → "76376508"
    const extractRutBody = (rut: string): string => {
        const clean = rut.replace(/[^0-9Kk\-]/g, ''); // quitar puntos y espacios, dejar guión
        // Si tiene guión, tomar solo la parte antes del guión (cuerpo sin DV)
        if (clean.includes('-')) return clean.split('-')[0];
        // Si no tiene guión, puede ser solo el cuerpo numérico (ej. "76376508" de LibreDTE)
        // o el cuerpo + DV pegado (ej. "763765083"). Heurística: si termina en K, quitar último char.
        // Para empresas los RUT tienen 8 dígitos de cuerpo. Si tiene 9+ chars y el último es dígito,
        // podría ser cuerpo+DV. Pero es ambiguo, así que devolvemos tal cual.
        return clean.replace(/[^0-9]/g, '');
    };

    // Calcular detalles del mismatch para mostrar en la alerta
    const rutMismatchDetails = (() => {
        for (const tx of selectedTxs) {
            let txRut = tx.providerRut || tx.metadata?.providerRut;
            if (!txRut && tx.metadata?.raw?.recipient_account?.holder_id) {
                txRut = String(tx.metadata.raw.recipient_account.holder_id);
            }
            if (!txRut && tx.description) {
                const rutMatch = tx.description.match(/(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])/i);
                if (rutMatch) txRut = rutMatch[1];
            }
            if (!txRut || typeof txRut !== 'string' || txRut.trim() === '') continue;
            
            const txBody = extractRutBody(txRut);
            if (!txBody || txBody.length < 6) continue;
            
            for (const dte of selectedDtes) {
                if (!dte.provider?.rut) continue;
                const dteBody = extractRutBody(dte.provider.rut);
                if (!dteBody || dteBody.length < 6) continue;
                if (txBody === dteBody) continue;
                if (txBody.startsWith(dteBody) || dteBody.startsWith(txBody)) continue;
                return { txRut, dteRut: dte.provider.rut, txBody, dteBody };
            }
        }
        return null;
    })();
    const rutMismatchAlert = !!rutMismatchDetails;

    // Detectar Parejas Exactas por RUT, Monto Exacto ($X) y Proximidad de Fecha
    const exactPairs = useMemo(() => {
        const pairs: Array<{ tx: any; dte: any }> = [];
        const usedDteIds = new Set<string>();

        const allTxs = selectedTxs.length > 0 ? selectedTxs : pendingTxs;
        const allDtes = selectedDtes.length > 0 ? selectedDtes : unpaidDtes;

        for (const tx of allTxs) {
            const txAmount = Math.abs(tx.amount || 0);
            if (txAmount === 0) continue;
            const txTime = new Date(tx.date).getTime();

            // Buscar candidatas con monto 100% exacto y ordenar por fecha más cercana
            const candidates = allDtes
                .filter(d => !usedDteIds.has(d.id) && Math.abs(d.totalAmount || d.outstandingAmount || 0) === txAmount)
                .sort((a, b) => {
                    const diffA = Math.abs(txTime - new Date(a.issuedDate).getTime());
                    const diffB = Math.abs(txTime - new Date(b.issuedDate).getTime());
                    return diffA - diffB;
                });

            if (candidates.length > 0) {
                const bestDte = candidates[0];
                pairs.push({ tx, dte: bestDte });
                usedDteIds.add(bestDte.id);
            }
        }
        return pairs;
    }, [selectedTxs, pendingTxs, selectedDtes, unpaidDtes]);

    const handleConfirmExactPairs = async (pairsToMatch: Array<{ tx: any; dte: any }>) => {
        setIsSaving(true);
        setSaveError(null);
        try {
            for (const p of pairsToMatch) {
                await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transactionIds: [p.tx.id],
                        dteIds: [p.dte.id],
                        notes: 'Auto-Conciliado por RUT y Monto Exacto'
                    })
                });
            }
            setSaveSuccess(true);
            setTimeout(() => {
                if (onRefresh) onRefresh();
                onClose();
            }, 600);
        } catch (err: any) {
            setSaveError(`Error al conciliar parejas: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; onClose(); } }}>
            <div className={`bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[92vh] overflow-hidden transition-all duration-300 ${selectedProvider ? 'max-w-[90vw] lg:max-w-7xl' : 'max-w-6xl'}`} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                
                <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 text-white">
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                            <span>Conciliación y Vincular Movimientos</span>
                            {selectedProvider && (
                                <span className="bg-slate-800 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full border border-slate-700 font-mono font-semibold">
                                    {selectedProvider.name || selectedProvider.rut}
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-slate-300 mt-0.5 font-medium">
                            {selectedProvider 
                                ? `Mostrando documentos y transferencias para RUT: ${selectedProvider.rut || selectedProvider.name}`
                                : dteSearch
                                ? `Búsqueda activa para: "${dteSearch}"`
                                : 'Cuadratura contable de cartolas bancarias con documentos DTE'}
                        </p>
                    </div>
                    <button onClick={() => { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; onClose(); }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Banner de Parejas Auto-Conciliadas en Verde */}
                {exactPairs.length > 0 && !saveSuccess && (
                    <div className="mx-6 mt-4 p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <CheckCircleIcon className="h-5 w-5 text-emerald-700 shrink-0" />
                                <div>
                                    <h3 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">
                                        {exactPairs.length} {exactPairs.length === 1 ? 'Coincidencia Exacta Identificada (RUT y Monto)' : 'Coincidencias Exactas Identificadas (RUT y Monto)'}
                                    </h3>
                                    <p className="text-[11px] text-emerald-800 font-medium">
                                        Movimiento bancario y documento tributario registran un valor idéntico ($CLP).
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleConfirmExactPairs(exactPairs)}
                                disabled={isSaving}
                                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-2 shrink-0 border border-emerald-700"
                            >
                                <CheckCircleIcon className="h-4 w-4 text-emerald-300" />
                                <span>Confirmar Conciliación 1:1 en 1 Clic</span>
                            </button>
                        </div>
                        <div className="divide-y divide-emerald-200 border-t border-emerald-200/80 pt-2 space-y-2">
                            {exactPairs.map((pair, pIdx) => (
                                <div key={pIdx} className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-2">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono font-extrabold text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                            {formatCurrency(pair.tx.amount)}
                                        </span>
                                        <div>
                                            <p className="font-bold text-slate-900">{pair.tx.description}</p>
                                            <p className="text-[10px] text-slate-500 font-mono">{formatDate(pair.tx.date)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-900 font-mono font-bold text-xs bg-emerald-100/60 px-2.5 py-1 rounded border border-emerald-200">
                                        <span>↔ Documento Folio #{pair.dte.folio} ({formatCurrency(pair.dte.totalAmount || pair.dte.outstandingAmount)})</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Alerta de discrepancia de RUT */}
                {rutMismatchAlert && (
                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
                        <div className="flex items-start gap-3">
                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
                            <div>
                                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Discrepancia de RUT Detectada</h3>
                                <p className="text-xs text-amber-800 mt-0.5">La transferencia bancaria tiene un RUT distinto al emisor del documento. Por favor verifica antes de confirmar la vinculación.</p>
                                {rutMismatchDetails && (
                                    <p className="text-[11px] text-amber-800 mt-1 font-mono bg-amber-100 px-2 py-0.5 rounded inline-block">
                                        Banco: {rutMismatchDetails.txRut} → Factura: {rutMismatchDetails.dteRut}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Banner de Error al Guardar */}
                {saveError && (
                    <div className="px-6 py-3 bg-slate-900 text-rose-300 border-b border-slate-800 flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-2">
                            <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-rose-400" />
                            <span>{saveError}</span>
                        </div>
                        <button onClick={() => setSaveError(null)} className="text-slate-400 hover:text-white p-1">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* Banner de Éxito al Guardar */}
                {saveSuccess && (
                    <div className="px-6 py-3 bg-slate-900 text-emerald-400 border-b border-slate-800 flex items-center justify-center gap-2 text-xs font-bold">
                        <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                        <span>Registro actualizado correctamente.</span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 grid md:grid-cols-2 gap-6 bg-slate-50/40 font-sans">
                    
                    {/* COLUMNA IZQUIERDA: Movimiento Bancario y Anotación Contable */}
                    <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                    <BanknotesIcon className="h-4 w-4 text-slate-600" />
                                    <span>Movimientos Bancarios ({selectedTxs.length})</span>
                                </h3>
                            </div>

                            {/* Buscador de Transferencias Opcional */}
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={txSearch}
                                        onChange={e => setTxSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && searchTxs()}
                                        placeholder="Buscar otra transferencia de este RUT..."
                                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all text-slate-800 placeholder-slate-400 font-medium"
                                    />
                                </div>
                                <button
                                    onClick={() => searchTxs()}
                                    disabled={txLoading}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                                >
                                    Buscar
                                </button>
                            </div>

                            {/* Lista de Transferencias Seleccionadas */}
                            {selectedTxs.length === 0 ? (
                                <div className="text-center text-slate-400 text-xs py-4 font-medium border border-dashed border-slate-200 rounded-lg">
                                    Ningún movimiento bancario seleccionado.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                        Movimientos Seleccionados:
                                    </div>
                                    {selectedTxs.map(tx => (
                                        <div key={tx.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex justify-between items-center text-xs">
                                            <div className="min-w-0 pr-2">
                                                <div className="font-bold text-slate-900 truncate" title={tx.description}>
                                                    {tx.description}
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-mono">
                                                    {formatDate(tx.date)} · {tx.bankAccount?.bankName || 'Banco'}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-mono font-extrabold text-slate-900">
                                                    {formatCurrency(tx.amount)}
                                                </span>
                                                <button
                                                    onClick={() => removeTx(tx.id)}
                                                    className="text-slate-400 hover:text-red-600 p-0.5"
                                                    title="Quitar de la selección"
                                                >
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Lista de Otras Transferencias Candidatas de este RUT */}
                            {pendingTxs.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                        Otras Transferencias Disponibles hacia este RUT ({pendingTxs.length}):
                                    </div>
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 divide-y divide-slate-100 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                                        {pendingTxs.map(tx => {
                                            const isSelected = selectedTxs.some(t => t.id === tx.id);
                                            return (
                                                <div key={tx.id} className="pt-2 pb-1.5 flex justify-between items-center text-xs">
                                                    <div className="min-w-0 pr-2">
                                                        <div className="font-semibold text-slate-800 truncate" title={tx.description}>
                                                            {tx.description}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-mono">
                                                            {formatDate(tx.date)}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className="font-mono font-bold text-slate-900">
                                                            {formatCurrency(tx.amount)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={isSelected}
                                                            onClick={() => addTx(tx)}
                                                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                                                isSelected
                                                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {isSelected ? 'Agregada' : '+ Agregar'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 font-mono">
                                <span>Total Movimiento Bancario:</span>
                                <span className="text-sm font-extrabold text-slate-900">{formatCurrency(totalTxs)}</span>
                            </div>
                        </div>

                        {/* Caja de Anotación u Observación Contable Opcional */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                    <PencilSquareIcon className="h-4 w-4 text-slate-600" />
                                    <span>Anotación o Detalle Contable (Opcional)</span>
                                </h4>
                                <span className="text-[10px] text-slate-400 font-mono">{note.length}/250</span>
                            </div>
                            <textarea 
                                rows={3}
                                maxLength={250}
                                value={note} 
                                onChange={e => setNote(e.target.value)} 
                                placeholder="Escriba la justificación, centro de costo o nota sobre esta transacción..." 
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:bg-white outline-none text-xs font-medium transition-all resize-none text-slate-900 placeholder-slate-400"
                            />
                        </div>

                        {selectedTxs.length > 0 && selectedDtes.length === 0 && looksLikeHonorarios(selectedTxs[0], selectedProvider) && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Trabajador a honorarios</h4>
                                    <p className="text-[11px] text-indigo-800 mt-0.5">
                                        La glosa parece un pago a persona (no empresa). Ingresa el N° de boleta para crear el documento y dejar el pago registrado.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] font-bold uppercase text-indigo-800 col-span-2">
                                        Nombre
                                        <input
                                            value={honorariosName}
                                            onChange={e => { setHonorariosName(e.target.value); if (e.target.value.length >= 3) searchProviders(e.target.value); }}
                                            placeholder="Ej. Arturo Saffores"
                                            className="mt-1 w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-700 text-slate-900"
                                        />
                                    </label>
                                    {providerResults.length > 0 && !selectedProvider && (
                                        <div className="col-span-2 max-h-24 overflow-y-auto border border-indigo-100 rounded-lg bg-white divide-y divide-indigo-50">
                                            {providerResults.slice(0, 5).map((p: any) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => { setSelectedProvider(p); setHonorariosName(p.name); setProviderResults([]); }}
                                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50"
                                                >
                                                    <span className="font-semibold text-slate-900">{p.name}</span>
                                                    <span className="text-slate-500 font-mono ml-2">{p.rut}</span>
                                                    {p.category && <span className="ml-2 text-[10px] uppercase text-indigo-700">{p.category}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {selectedProvider && (
                                        <div className="col-span-2 text-[11px] text-indigo-900 font-medium">
                                            Perfil: {selectedProvider.name} {selectedProvider.category ? `(${selectedProvider.category})` : '(se marcará HONORARIOS)'}
                                        </div>
                                    )}
                                    <label className="text-[10px] font-bold uppercase text-indigo-800">
                                        Tipo
                                        <select
                                            value={boletaKind}
                                            onChange={e => setBoletaKind(Number(e.target.value) as 39 | 112)}
                                            className="mt-1 w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-700 text-slate-900"
                                        >
                                            <option value={112}>Boleta de honorarios</option>
                                            <option value={39}>Boleta electrónica</option>
                                        </select>
                                    </label>
                                    <label className="text-[10px] font-bold uppercase text-indigo-800">
                                        N° boleta
                                        <input
                                            value={boletaFolio}
                                            onChange={e => setBoletaFolio(e.target.value.replace(/\D/g, ''))}
                                            placeholder="14"
                                            inputMode="numeric"
                                            className="mt-1 w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-700 text-slate-900 font-mono"
                                        />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* COLUMNA DERECHA: Documentos Tributarios (DTEs) del Proveedor */}
                    <div className="space-y-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                    <DocumentTextIcon className="h-4 w-4 text-slate-600" />
                                    <span>Facturas / Documentos del Proveedor</span>
                                </h3>
                                {selectedProvider && (
                                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 truncate max-w-[200px]">
                                        RUT: {selectedProvider.rut || selectedProvider.name}
                                    </span>
                                )}
                            </div>

                            {/* Buscador de DTEs */}
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={dteSearch}
                                        onChange={e => setDteSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && searchDtes()}
                                        placeholder="Buscar por folio o monto..."
                                        className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-slate-900 focus:bg-white transition-all text-slate-800 placeholder-slate-400 font-medium"
                                    />
                                </div>
                                <button
                                    onClick={() => searchDtes()}
                                    disabled={dteLoading}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
                                >
                                    Buscar
                                </button>
                            </div>

                            {/* Lista de Documentos Candidatos Disponibles */}
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1 divide-y divide-slate-100 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                                {unpaidDtes.length === 0 ? (
                                    <div className="text-center text-slate-400 text-xs py-6 font-medium">
                                        No hay facturas impagas adicionales de este proveedor en el periodo.
                                    </div>
                                ) : (
                                    unpaidDtes.map(dte => {
                                        const isSelected = selectedDtes.some(d => d.id === dte.id);
                                        return (
                                            <div key={dte.id} className="pt-2 pb-1.5 flex justify-between items-center text-xs">
                                                <div>
                                                    <div className="font-bold text-slate-900">
                                                        Folio: #{dte.folio}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-mono">
                                                        {formatDate(dte.issuedDate)} · {dte.provider?.name || 'Proveedor'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono font-bold text-slate-900">
                                                        {formatCurrency(dte.totalAmount)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => isSelected ? removeDte(dte.id) : addDte(dte)}
                                                        className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                                                            isSelected
                                                                ? 'bg-slate-800 text-white shadow-2xs'
                                                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        {isSelected ? 'Seleccionada' : 'Seleccionar'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Facturas Seleccionadas para Conciliar */}
                            {selectedDtes.length > 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                                        Facturas Seleccionadas ({selectedDtes.length}):
                                    </div>
                                    {selectedDtes.map(dte => (
                                        <div key={dte.id} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-slate-200 shadow-2xs">
                                            <span className="font-bold text-slate-800">Folio: #{dte.folio} ({formatDate(dte.issuedDate)})</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-slate-900">{formatCurrency(dte.totalAmount)}</span>
                                                <button onClick={() => removeDte(dte.id)} className="text-slate-400 hover:text-red-600 p-0.5">
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-slate-800 font-mono">
                                <span>Total Facturas Seleccionadas:</span>
                                <span className="text-sm font-extrabold text-slate-900">{formatCurrency(totalDtes)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-5 flex items-center justify-between">
                    
                    <div className="flex-1">
                        {selectedTxs.length > 0 && selectedDtes.length > 0 && (
                            <div className="flex flex-col gap-3">
                                {rutMismatchAlert && (
                                    <div className="flex items-center gap-3 text-rose-800 bg-rose-100/80 px-4 py-3 rounded-lg border border-rose-300 shadow-sm animate-pulse">
                                        <ExclamationTriangleIcon className="h-6 w-6 text-rose-600" />
                                        <div>
                                            <div className="font-bold text-sm">¡Alerta de Inconsistencia de RUT!</div>
                                            <div className="text-xs text-rose-700 opacity-90">El destinatario original de la transferencia bancaria no coincide con el RUT del proveedor de esta factura. Verifica bien antes de confirmar.</div>
                                        </div>
                                    </div>
                                )}
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
                                    <div className={`flex flex-col gap-3 px-4 py-3 rounded-xl border ${diff > 0 ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm' : 'bg-rose-50 text-rose-900 border-rose-200 shadow-sm'}`}>
                                        <div className="flex items-center gap-3">
                                            <ExclamationTriangleIcon className={`h-8 w-8 ${diff > 0 ? 'text-amber-600' : 'text-rose-600'}`} />
                                            <div>
                                                <div className="font-bold text-base">Diferencia: {formatCurrency(Math.abs(diff))}</div>
                                                <div className="text-xs font-medium opacity-80 mt-0.5">
                                                    {diff > 0 
                                                        ? 'El pago en el banco es mayor al documento.' 
                                                        : 'El documento es por un monto mayor al pago.'}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {(!hasMatchedDtes && mode !== 'ANNOTATE') && (
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    onClick={() => setDiffResolution('PARTIAL')}
                                                    className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg shadow-sm border transition-all ${diffResolution === 'PARTIAL' ? 'bg-white border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/20' : 'bg-white/60 border-black/10 hover:bg-white hover:border-black/20 text-slate-600'}`}
                                                >
                                                    Dejar pago parcial
                                                </button>
                                                <button
                                                    onClick={() => setDiffResolution('EXACT')}
                                                    className={`flex-1 py-2 px-2 text-xs font-bold rounded-lg shadow-sm border transition-all ${diffResolution === 'EXACT' ? 'bg-white border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/20' : 'bg-white/60 border-black/10 hover:bg-white hover:border-black/20 text-slate-600'}`}
                                                >
                                                    Liquidar y absorber
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                <div className="flex-1 max-w-[500px]">
                                    <div className="relative h-full flex flex-col justify-center">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 pointer-events-none">
                                            <PencilSquareIcon className="h-full w-full text-slate-400" />
                                        </div>
                                        <input
                                            value={note}
                                            onChange={e => setNote(e.target.value)}
                                            placeholder="Ingresa un comentario / nota (Opcional)..."
                                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-shadow"
                                        />
                                    </div>
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

                    <div className="flex items-center justify-between mt-6">
                        <div className="flex gap-3">
                            {((suggestionId && selectedDtes.length > 0) || (mode === 'SUGGESTION' && selectedDtes.length > 0) || (mode === 'REVIEW' && (matchStatus === 'SUGGESTED' || matchStatus === 'DRAFT') && selectedDtes.length > 0)) && (
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
                        </div>

                        <div className="flex">
                            <button 
                                onClick={() => handleSave(diffResolution || 'EXACT')} 
                                disabled={(selectedTxs.length === 0 && selectedDtes.length === 0) || isSaving || (selectedTxs.length > 0 && !isPerfect && selectedDtes.length > 0 && mode !== 'ANNOTATE' && !hasMatchedDtes && !diffResolution)}
                                className={`px-8 py-3 text-sm font-bold text-white shadow-md rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${(selectedDtes.length === 0 || selectedTxs.length === 0) ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 hover:shadow-lg' : hasMatchedDtes ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30 hover:shadow-lg' : isPerfect ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30 hover:shadow-lg' : diffResolution ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30 hover:shadow-lg' : 'bg-slate-300 text-white shadow-none'}`}
                            >
                                {isSaving ? 'Guardando...' : 
                                 boletaFolio && selectedTxs.length > 0 && selectedDtes.length === 0 ? 'Registrar boleta y conciliar' :
                                 selectedDtes.length === 0 ? 'Guardar Anotación Manual' :
                                 selectedTxs.length === 0 ? 'Anotar / Pagar Manualmente' :
                                 hasMatchedDtes ? 'Confirmar y Reasignar' :
                                 isPerfect ? 'Confirmar Cuadratura Perfecta' : 
                                 diffResolution === 'PARTIAL' ? 'Confirmar Pago Parcial' : 
                                 diffResolution === 'EXACT' ? 'Liquidar con Diferencia' : 'Selecciona una resolución'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
