'use client';

import { useState, useEffect, use, useMemo } from 'react';
import PrintStatementModal from './PrintStatementModal';
import {
    ArrowLeftIcon,
    DocumentTextIcon,
    BanknotesIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ClockIcon,
    ExclamationTriangleIcon,
    ArrowTrendingUpIcon,
    InboxIcon,
    CreditCardIcon,
    BellAlertIcon,
    CalendarDaysIcon,
    LinkIcon,
    XMarkIcon,
    XCircleIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { getApiUrl, authFetch } from '@/lib/api';

interface DTE {
    id: string;
    folio: number;
    type: number;
    totalAmount: number;
    outstandingAmount: number;
    issuedDate: string;
    dueDate: string | null;
    paymentStatus: string;
    matches: Array<{
        id: string;
        status: string;
        confidence: number;
        createdAt: string;
        transaction: {
            date: string;
            amount: number;
            description: string;
            bankAccount?: { bankName: string };
        };
    }>;
}

interface Payment {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference: string | null;
}

interface ProviderDetail {
    id: string;
    rut: string;
    name: string;
    category: string | null;
    transferBankName: string | null;
    transferAccountNumber: string | null;
    transferAccountType: string | null;
    transferRut: string | null;
    transferEmail: string | null;
    dtes: DTE[];
    payments: Payment[];
    metrics: {
        totalDebt: number;
        totalInvoiced: number;
        paidAmount: number;
        invoiceCount: number;
        paymentCount: number;
    };
}

function getDueDays(dte: DTE): { days: number; label: string; urgency: 'overdue' | 'urgent' | 'soon' | 'ok' | 'paid' } {
    if (dte.paymentStatus === 'PAID') return { days: 0, label: 'Pagado', urgency: 'paid' };

    const ref = dte.dueDate ? new Date(dte.dueDate) : new Date(new Date(dte.issuedDate).getTime() + 30 * 86400000);
    const diff = Math.ceil((ref.getTime() - Date.now()) / 86400000);

    if (diff < 0) return { days: Math.abs(diff), label: `Vencida hace ${Math.abs(diff)}d`, urgency: 'overdue' };
    if (diff <= 5) return { days: diff, label: `Vence en ${diff}d`, urgency: 'urgent' };
    if (diff <= 15) return { days: diff, label: `Vence en ${diff}d`, urgency: 'soon' };
    return { days: diff, label: `Vence en ${diff}d`, urgency: 'ok' };
}

const DTE_TYPE_LABELS: Record<number, string> = { 33: 'Factura', 34: 'F. Exenta', 61: 'Nota Crédito', 56: 'Nota Débito' };

const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
};

export default function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [provider, setProvider] = useState<ProviderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'TODOS' | 'PAGOS' | 'MOVIMIENTOS_ALIAS'>('PENDIENTES');
    const [selectedDteIds, setSelectedDteIds] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState('2026');
    const [reviewModal, setReviewModal] = useState<{ dte: DTE; match: any } | null>(null);
    const [reviewComment, setReviewComment] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    
    // Manual match states
    const [manualMatchDte, setManualMatchDte] = useState<DTE | null>(null);
    const [manualMatchSearch, setManualMatchSearch] = useState('');
    const [manualMatchTxList, setManualMatchTxList] = useState<any[]>([]);
    const [manualMatchTxLoading, setManualMatchTxLoading] = useState(false);
    const [manualMatchLoading, setManualMatchLoading] = useState(false);

    const [bankAccounts, setBankAccounts] = useState<any[]>([]);
    const [creationView, setCreationView] = useState(false);
    const [creationForm, setCreationForm] = useState({
        bankAccountId: '',
        sourceFile: '',
        date: '',
        description: '',
        amount: 0,
        type: 'DEBIT' as 'CREDIT' | 'DEBIT'
    });

    useEffect(() => { loadProviderDetail(); }, [id]);
    useEffect(() => {
        const fetchBanks = async () => {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/transactions/source-files-all`);
            const data = await res.json();
            setBankAccounts(data);
        };
        fetchBanks();
    }, []);

    const loadProviderDetail = async () => {
        try {
            setLoading(true);
            const API_URL = getApiUrl();
            const response = await authFetch(`${API_URL}/proveedores/${id}`);
            const data = await response.json();
            setProvider(data);
        } catch (error) {
            console.error('Error loading provider detail:', error);
        } finally {
            setLoading(false);
        }
    };

    const searchManualMatchTransactions = async () => {
        if (!manualMatchSearch.trim()) return;
        setManualMatchTxLoading(true);
        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/transactions?search=${encodeURIComponent(manualMatchSearch)}&status=PENDING&limit=20`);
            const data = await res.json();
            setManualMatchTxList(data.data || data || []);
        } catch (err) {
            console.error('Error searching tx:', err);
        } finally {
            setManualMatchTxLoading(false);
        }
    };

    const handleSaveManualMatch = async (txId: string) => {
        if (!manualMatchDte) return;
        setManualMatchLoading(true);
        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: txId, dteId: manualMatchDte.id })
            });
            if (!res.ok) throw new Error('Error al vincular');
            setManualMatchDte(null);
            setManualMatchSearch('');
            setManualMatchTxList([]);
            loadProviderDetail();
        } catch (err) {
            alert('No se pudo vincular. Revisa los montos o deudas.');
            console.error('Error in manual match:', err);
        } finally {
            setManualMatchLoading(false);
        }
    };

    const handleCreateAndLink = async () => {
        if (!manualMatchDte || !creationForm.bankAccountId || !creationForm.description || !creationForm.amount) {
            alert('Por favor, completa todos los campos del formulario.');
            return;
        }
        setManualMatchLoading(true);
        try {
            const API_URL = getApiUrl();
            // 1. Create manual transaction
            const resCreate = await authFetch(`${API_URL}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(creationForm),
            });
            if (!resCreate.ok) throw new Error('Error al crear movimiento manual');
            const createdTx = await resCreate.json();

            // 2. Link it to the DTE
            const resLink = await authFetch(`${API_URL}/conciliacion/matches/manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: createdTx.id, dteId: manualMatchDte.id })
            });

            if (!resLink.ok) throw new Error('Error al vincular con el DTE');

            setManualMatchDte(null);
            setCreationView(false);
            setCreationForm({ bankAccountId: '', sourceFile: '', date: '', description: '', amount: 0, type: 'DEBIT' });
            loadProviderDetail();
        } catch (err: any) {
            alert('Error: ' + (err?.message || 'No se pudo vincular.'));
            console.error(err);
        } finally {
            setManualMatchLoading(false);
        }
    };

    const handleMatchAction = async (status: 'CONFIRMED' | 'REJECTED') => {
        if (!reviewModal) return;
        setReviewLoading(true);
        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/conciliacion/matches/${reviewModal.match.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason: reviewComment || undefined }),
            });
            if (!res.ok) throw new Error('Error al actualizar');
            setReviewModal(null);
            setReviewComment('');
            loadProviderDetail();
        } catch (err) {
            console.error(err);
        } finally {
            setReviewLoading(false);
        }
    };

    const handleDiscardMatch = async (matchId: string) => {
        if (!confirm('¿Estás seguro de que deseas desvincular este pago?')) return;
        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/conciliacion/matches/${matchId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error al desvincular.');
            loadProviderDetail();
        } catch (err: any) {
            alert(err?.message || 'Error al desvincular.');
        }
    };

    const formatCurrency = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount);
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

    const yearFilteredDtes = (provider?.dtes || []).filter(d => {
        const year = new Date(d.issuedDate).getFullYear().toString();
        return year === selectedYear;
    });

    const filteredMetrics = useMemo(() => {
        if (!provider) return { totalDebt: 0, totalInvoiced: 0, paidAmount: 0, invoiceCount: 0, paymentCount: 0 };
        const totalDebt = yearFilteredDtes.reduce((sum, dte) => sum + dte.outstandingAmount, 0);
        const totalInvoiced = yearFilteredDtes.reduce((sum, dte) => sum + dte.totalAmount, 0);
        return {
            totalDebt,
            totalInvoiced,
            paidAmount: totalInvoiced - totalDebt,
            invoiceCount: yearFilteredDtes.length,
            paymentCount: provider.payments.length,
        };
    }, [provider, yearFilteredDtes]);

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-600 font-medium">Cargando detalle...</p>
            </div>
        </div>
    );

    if (!provider) return (
        <div className="text-center py-20">
            <InboxIcon className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800">Proveedor no encontrado</h2>
            <Link href="/proveedores" className="text-indigo-600 hover:text-indigo-800 mt-4 inline-block font-medium">Volver al listado</Link>
        </div>
    );



    const pendingDtes = yearFilteredDtes.filter(d => d.paymentStatus !== 'PAID');
    const paidDtes = yearFilteredDtes.filter(d => d.paymentStatus === 'PAID');
    const overdueDtes = pendingDtes.filter(d => getDueDays(d).urgency === 'overdue');
    const urgentDtes = pendingDtes.filter(d => getDueDays(d).urgency === 'urgent');

    // Pagos conciliados con cartolas (desde matches de cada DTE); luego los registros manuales (Payment)
    const reconciledPayments = yearFilteredDtes.flatMap((dte) =>
        (dte.matches || []).map((m) => ({
            id: m.id,
            date: m.transaction.date,
            amount: m.transaction.amount,
            description: m.transaction.description,
            bankName: m.transaction.bankAccount?.bankName,
            dteFolio: dte.folio,
            status: m.status,
            source: 'reconciled' as const,
        }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const manualPayments = (provider.payments || []).map((p) => ({
        id: p.id,
        date: p.paymentDate,
        amount: p.amount,
        description: p.reference || 'Pago manual',
        bankName: null,
        dteFolio: null,
        status: null,
        source: 'manual' as const,
    }));
    const allPaymentsForTab = [...reconciledPayments, ...manualPayments];

    const dtesForTab = activeTab === 'PENDIENTES'
        ? [...pendingDtes].sort((a, b) => getDueDays(a).days - getDueDays(b).days)
        : activeTab === 'TODOS'
            ? [
                ...pendingDtes.sort((a, b) => getDueDays(a).days - getDueDays(b).days),
                ...paidDtes.sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime()),
              ]
            : [];

    const toggleSelectAllPending = () => {
        if (selectedDteIds.length === pendingDtes.length) {
            setSelectedDteIds([]);
        } else {
            setSelectedDteIds(pendingDtes.map(d => d.id));
        }
    };

    const toggleDteSelection = (id: string) => {
        setSelectedDteIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const selectedPendingDtes = pendingDtes.filter(d => selectedDteIds.includes(d.id));
    const selectedTotalOutstanding = selectedPendingDtes.reduce((sum, d) => sum + d.outstandingAmount, 0);

    return (
        <>
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/proveedores" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeftIcon className="h-6 w-6 text-slate-600" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{provider.name}</h1>
                        <div className="flex items-center mt-1 space-x-3">
                            <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{provider.rut}</span>
                            {provider.category && (
                                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-wider">{provider.category}</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <select
                        value={selectedYear}
                        onChange={(e) => { setSelectedYear(e.target.value); setSelectedDteIds([]); }}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                    </select>
                    <button onClick={() => setPrintModalOpen(true)} className="px-4 py-2 border border-indigo-200 rounded-lg text-sm font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center shadow-sm">
                        <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Exportar
                    </button>
                    <button onClick={loadProviderDetail} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center">
                        <ArrowPathIcon className="h-4 w-4 mr-2" /> Actualizar
                    </button>
                </div>
            </div>

            {/* Alerta de vencimientos */}
            {(overdueDtes.length > 0 || urgentDtes.length > 0) && (
                <div className={`rounded-xl p-4 border-l-4 flex items-start space-x-3 ${overdueDtes.length > 0 ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-500'}`}>
                    <BellAlertIcon className={`h-6 w-6 shrink-0 mt-0.5 ${overdueDtes.length > 0 ? 'text-red-500' : 'text-amber-500'}`} />
                    <div>
                        <h3 className={`font-bold text-sm ${overdueDtes.length > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                            {overdueDtes.length > 0 ? `${overdueDtes.length} factura(s) vencida(s)` : `${urgentDtes.length} factura(s) por vencer en los pr\u00f3ximos 5 d\u00edas`}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">
                            {overdueDtes.length > 0
                                ? `Monto vencido: ${formatCurrency(overdueDtes.reduce((s, d) => s + d.outstandingAmount, 0))}. Estas facturas desaparecer\u00e1n al detectar el pago en una cartola.`
                                : `Monto pr\u00f3ximo a vencer: ${formatCurrency(urgentDtes.reduce((s, d) => s + d.outstandingAmount, 0))}.`
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-slate-100 p-3 rounded-xl text-slate-600"><DocumentTextIcon className="h-6 w-6" /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900">{filteredMetrics.invoiceCount}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Documentos</div>
                    </div>
                </div>
                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600"><ArrowTrendingUpIcon className="h-6 w-6" /></div>
                    <div>
                        <div className="text-2xl font-bold text-indigo-700">{formatCurrency(filteredMetrics.totalInvoiced)}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Facturado</div>
                    </div>
                </div>
                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><CheckCircleIcon className="h-6 w-6" /></div>
                    <div>
                        <div className="text-2xl font-bold text-emerald-700">{formatCurrency(filteredMetrics.paidAmount)}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pagado</div>
                    </div>
                </div>
                <div className="card-glass p-5 flex items-center space-x-4 border-2 border-red-100">
                    <div className="bg-red-500 p-3 rounded-xl text-white"><BanknotesIcon className="h-6 w-6" /></div>
                    <div>
                        <div className="text-2xl font-bold text-red-700">{formatCurrency(filteredMetrics.totalDebt)}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Deuda</div>
                    </div>
                </div>
                <div className="card-glass p-5 flex items-center space-x-4">
                    <div className={`p-3 rounded-xl ${overdueDtes.length > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                        <CalendarDaysIcon className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900">{pendingDtes.length}</div>
                        <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pendientes</div>
                        {overdueDtes.length > 0 && <div className="text-[10px] text-red-600 font-bold">{overdueDtes.length} vencidas</div>}
                    </div>
                </div>
            </div>

            {/* Datos de Transferencia */}
            <TransferBankCard provider={provider} onSaved={loadProviderDetail} formatCurrency={formatCurrency} />

            {/* Tabs & Content */}
            <div className="card-glass overflow-hidden flex flex-col min-h-[400px]">
                <div className="flex border-b border-slate-100">
                    {(['PENDIENTES', 'TODOS', 'PAGOS', 'MOVIMIENTOS_ALIAS'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-4 text-sm font-bold uppercase tracking-widest transition-colors ${activeTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'}`}>
                            {tab === 'PENDIENTES' ? `Por Pagar (${pendingDtes.length})` : 
                             tab === 'TODOS' ? `Todos (${pendingDtes.length} pend. / ${paidDtes.length} pag.)` : 
                             tab === 'PAGOS' ? `Pagos (${allPaymentsForTab.length})` : 
                             `Movimientos Alias (${(provider as any).aliasMovements?.length || 0})`}
                        </button>
                    ))}
                </div>

                {/* Barra de selección masiva (solo pendientes) */}
                {activeTab === 'PENDIENTES' && selectedPendingDtes.length > 0 && (
                    <div className="px-6 py-3 border-b border-slate-100 bg-indigo-50/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-indigo-700">
                                {selectedPendingDtes.length} documento(s) seleccionados
                            </span>
                            <span className="text-slate-500">
                                Total a pagar:&nbsp;
                                <span className="font-bold text-slate-900">
                                    {formatCurrency(selectedTotalOutstanding)}
                                </span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedDteIds([])}
                                className="px-3 py-1 rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 font-medium"
                            >
                                Limpiar selección
                            </button>
                            {/* Botones futuros: programar pago / exportar masivo */}
                            <button
                                disabled
                                className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold text-[11px] uppercase tracking-widest opacity-60 cursor-not-allowed"
                                title="Próximamente: programar pago masivo"
                            >
                                Programar pago masivo
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-0 overflow-x-auto">
                    {(activeTab === 'PENDIENTES' || activeTab === 'TODOS') && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-tight text-[11px]">
                                <tr>
                                    {activeTab === 'PENDIENTES' && (
                                        <th className="px-4 py-4 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                onChange={toggleSelectAllPending}
                                                checked={
                                                    pendingDtes.length > 0 &&
                                                    selectedDteIds.length === pendingDtes.length
                                                }
                                                aria-label="Seleccionar todos los pendientes"
                                            />
                                        </th>
                                    )}
                                    <th className="px-6 py-4">Emisión</th>
                                    <th className="px-6 py-4">Folio / Tipo</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4 text-right">Pendiente</th>
                                    <th className="px-6 py-4 text-center">Vencimiento</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                    <th className="px-6 py-4">Conciliación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {dtesForTab.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                                        {activeTab === 'PENDIENTES' ? 'Sin facturas pendientes de pago' : 'Sin documentos'}
                                    </td></tr>
                                ) : dtesForTab.map(dte => {
                                    const due = getDueDays(dte);
                                    const match = dte.matches?.[0];
                                    const urgencyStyles = {
                                        overdue: 'bg-red-100 text-red-700 border-red-200',
                                        urgent: 'bg-amber-100 text-amber-700 border-amber-200',
                                        soon: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                                        ok: 'bg-slate-50 text-slate-600 border-slate-200',
                                        paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                    };
                                    const isSelectable = dte.paymentStatus !== 'PAID' && activeTab === 'PENDIENTES';
                                    const isChecked = selectedDteIds.includes(dte.id);

                                    return (
                                        <tr key={dte.id} className={`transition-colors ${due.urgency === 'overdue' ? 'bg-red-50/40' : due.urgency === 'urgent' ? 'bg-amber-50/30' : 'hover:bg-slate-50/30'}`}>
                                            {activeTab === 'PENDIENTES' && (
                                                <td className="px-4 py-4 text-center align-middle">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        checked={isChecked}
                                                        disabled={!isSelectable}
                                                        onChange={() => toggleDteSelection(dte.id)}
                                                        aria-label={`Seleccionar DTE folio ${dte.folio}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="px-6 py-4 text-slate-900 font-medium whitespace-nowrap">{formatDate(dte.issuedDate)}</td>
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-slate-900">Folio {dte.folio}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase">{DTE_TYPE_LABELS[dte.type] || `Tipo ${dte.type}`}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-slate-900">{formatCurrency(dte.totalAmount)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`font-bold ${dte.outstandingAmount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {formatCurrency(dte.outstandingAmount)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${urgencyStyles[due.urgency]}`}>
                                                    {due.urgency === 'overdue' && <ExclamationTriangleIcon className="h-3 w-3 mr-1" />}
                                                    {due.urgency === 'urgent' && <ClockIcon className="h-3 w-3 mr-1" />}
                                                    {due.urgency === 'paid' && <CheckCircleIcon className="h-3 w-3 mr-1" />}
                                                    {due.label}
                                                </span>
                                                {dte.dueDate && <div className="text-[9px] text-slate-400 mt-1">{formatDate(dte.dueDate)}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${dte.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {dte.paymentStatus === 'PAID' ? 'PAGADO' : 'PENDIENTE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {match ? (() => {
                                                    const payment = (match as any).payment;
                                                    const txDesc = match.transaction?.description || (payment ? 'Carga Manual / Registro' : 'Transacción');
                                                    const txAmount = match.transaction?.amount != null ? match.transaction.amount : payment?.amount || 0;
                                                    const txDate = match.transaction?.date || payment?.date;

                                                    return (
                                                        <button 
                                                            type="button" 
                                                            onClick={(e) => { e.stopPropagation(); setReviewModal({ dte, match }); }} 
                                                            className="flex flex-col items-start gap-1 p-1 hover:bg-slate-100 rounded transition-colors w-full text-left cursor-pointer border border-transparent hover:border-slate-200"
                                                            title="Revisar match"
                                                        >
                                                            {match.status === 'CONFIRMED' ? (
                                                                <div className="flex items-center text-emerald-600 font-bold text-[11px] mb-0.5">
                                                                    <CheckCircleIcon className="h-3.5 w-3.5 mr-1" /> Match
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center text-blue-600 font-bold text-[11px] mb-0.5">
                                                                    <ClockIcon className="h-3.5 w-3.5 mr-1" /> Sugerencia
                                                                </div>
                                                            )}
                                                            <div className="text-slate-700 font-semibold truncate max-w-[180px] leading-tight" title={txDesc}>
                                                                {txDesc}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400">
                                                                {txDate ? formatDate(txDate) : '—'} &bull; {formatCurrency(Math.abs(txAmount))}
                                                            </div>
                                                        </button>
                                                    );
                                                })() : (
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">Sin match</span>
                                                        {dte.paymentStatus !== 'PAID' && (
                                                            <button 
                                                                onClick={() => {
                                                                    setManualMatchDte(dte);
                                                                    setManualMatchSearch(dte.totalAmount.toString());
                                                                    searchManualMatchTransactions();
                                                                }}
                                                                className="text-[9px] bg-slate-50 border border-slate-200 text-indigo-600 font-bold px-1.5 py-0.5 rounded hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center shadow-sm"
                                                            >
                                                                <LinkIcon className="h-2.5 w-2.5 mr-0.5" /> Vincular Pago
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'PAGOS' && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-tight text-[11px]">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Descripción / Origen</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {allPaymentsForTab.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Sin pagos (ni conciliados con cartola ni registros manuales)</td></tr>
                                ) : allPaymentsForTab.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-6 py-4 text-slate-900 font-medium whitespace-nowrap">{formatDate(payment.date)}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 truncate max-w-[240px]" title={payment.description}>{payment.description}</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                {payment.source === 'reconciled' ? (
                                                    <>Cartola · {payment.bankName || 'Banco'} {payment.dteFolio != null && <>· DTE Folio {payment.dteFolio}</>}</>
                                                ) : (
                                                    'Pago manual'
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-indigo-600 text-base">{formatCurrency(payment.amount)}</td>
                                        <td className="px-6 py-4 text-center">
                                            {payment.source === 'reconciled' && payment.status && (
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${payment.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                    {payment.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador'}
                                                </span>
                                            )}
                                            {payment.source === 'manual' && <CreditCardIcon className="h-5 w-5 mx-auto text-slate-300" />}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    
                    {activeTab === 'MOVIMIENTOS_ALIAS' && (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-tight text-[11px]">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Descripción / Cartola</th>
                                    <th className="px-6 py-4 text-right">Monto</th>
                                    <th className="px-6 py-4 text-center">Nota / Alias</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {!(provider as any).aliasMovements || (provider as any).aliasMovements.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Sin movimientos vinculados por alias</td></tr>
                                ) : (provider as any).aliasMovements.map((m: any) => (
                                    <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-6 py-4 text-slate-900 font-medium whitespace-nowrap">{formatDate(m.date)}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 truncate max-w-[240px]" title={m.description}>{m.description}</div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                                {m.bankAccount?.bankName || 'Banco'} &middot; {m.bankAccount?.accountNumber || '—'}
                                            </div>
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold ${m.type === 'CREDIT' ? 'text-green-600' : 'text-red-700'}`}>
                                            {formatCurrency(m.amount)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {m.metadata?.reviewNote ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">
                                                    {m.metadata.reviewNote}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic text-xs">Anotado sin nota</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
        
        {manualMatchDte && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 animate-fade-in-up">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div>
                            <h3 className="font-bold text-slate-800">Vincular Pago Manualmente</h3>
                            <p className="text-[11px] text-slate-500">DTE Folio {manualMatchDte.folio} &bull; Total: {formatCurrency(manualMatchDte.totalAmount)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => { 
                                    setCreationView(!creationView); 
                                    if (!creationView) {
                                        setCreationForm({
                                            bankAccountId: '',
                                            sourceFile: '',
                                            date: new Date().toISOString().split('T')[0],
                                            description: `Pago Folio ${manualMatchDte.folio}`,
                                            amount: manualMatchDte.totalAmount,
                                            type: 'DEBIT'
                                        });
                                    }
                                }} 
                                className="text-[10px] text-indigo-600 font-bold hover:underline"
                            >
                                {creationView ? 'Volver a Buscar' : '¿No está aquí? Ingrésalo'}
                            </button>
                            <button onClick={() => { setManualMatchDte(null); setCreationView(false); setManualMatchSearch(''); setManualMatchTxList([]); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200">
                                <span className="text-xl font-bold">&times;</span>
                            </button>
                        </div>
                    </div>
                    
                    {creationView ? (
                        <div className="p-4 space-y-3 flex-1 overflow-y-auto bg-slate-50">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Cartola de Origen</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                                    value={`${creationForm.bankAccountId}|${creationForm.sourceFile}`}
                                    onChange={e => {
                                        const [bId, file] = e.target.value.split('|');
                                        setCreationForm({ ...creationForm, bankAccountId: bId, sourceFile: file });
                                    }}
                                >
                                    <option value="|">Selecciona cartola...</option>
                                    {bankAccounts.map((c: any) => (
                                        <option key={`${c.bankAccountId}-${c.filename}`} value={`${c.bankAccountId}|${c.filename}`}>
                                            {c.filename} - {c.bankName} ({c.accountNumber})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
                                    <input type="date" value={creationForm.date} onChange={e => setCreationForm({ ...creationForm, date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Movimiento</label>
                                    <select value={creationForm.type} onChange={e => setCreationForm({ ...creationForm, type: e.target.value as any })} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
                                        <option value="DEBIT">Egreso (Cargo/Gasto)</option>
                                        <option value="CREDIT">Ingreso (Abono/Depósito)</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                                <input type="text" value={creationForm.description} onChange={e => setCreationForm({ ...creationForm, description: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Monto ($)</label>
                                <input type="number" value={creationForm.amount} onChange={e => setCreationForm({ ...creationForm, amount: parseInt(e.target.value, 10) || 0 })} className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                            </div>
                            <button 
                                onClick={handleCreateAndLink} 
                                disabled={manualMatchLoading} 
                                className="w-full mt-4 bg-emerald-600 text-white rounded-lg px-4 py-2 font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                            >
                                {manualMatchLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                                Crear y Vincular Pago
                            </button>
                        </div>
                    ) : (
                        <>
                        <div className="p-4 border-b border-slate-100 bg-white">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Buscar Transacción en Cartolas (Pendientes)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={manualMatchSearch}
                                    onChange={e => setManualMatchSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchManualMatchTransactions()}
                                    placeholder="Monto o palabra clave..."
                                    className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                                />
                                <button 
                                    onClick={searchManualMatchTransactions}
                                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center"
                                >
                                    {manualMatchTxLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : 'Buscar'}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
                            {manualMatchTxList.length === 0 ? (
                                <p className="text-center text-sm text-slate-400 py-8">Busca para ver transacciones pendientes en cartola...</p>
                            ) : (
                                manualMatchTxList.map((tx: any) => (
                                    <div key={tx.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition-all flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs font-bold text-slate-800 truncate" title={tx.description}>{tx.description}</div>
                                            <div className="text-[10px] text-slate-400">{formatDate(tx.date)} &bull; {tx.bankAccount?.bankName}</div>
                                        </div>
                                        <div className="text-right ml-4 shrink-0">
                                            <div className={`font-bold text-sm ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(tx.amount)}
                                            </div>
                                            <button 
                                                onClick={() => handleSaveManualMatch(tx.id)}
                                                disabled={manualMatchLoading}
                                                className="mt-1 px-2 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 text-emerald-700 rounded text-[10px] font-bold transition-all flex items-center gap-1 ml-auto"
                                            >
                                                {manualMatchLoading ? <ArrowPathIcon className="h-3 w-3 animate-spin" /> : <CheckCircleIcon className="h-3 w-3" />}
                                                Vincular
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        </>
                    )}
                </div>
            </div>
        )}
            {reviewModal && (reviewModal.match.transaction || (reviewModal.match as any).payment) && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center overflow-hidden p-3" onClick={() => setReviewModal(null)} style={{ touchAction: 'none' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className={`shrink-0 px-5 py-3 border-b border-slate-100 flex justify-between items-center ${reviewModal.match.status === 'CONFIRMED' ? 'bg-gradient-to-r from-emerald-50 to-green-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50'}`}>
                            <div>
                                <h2 className="text-base font-bold text-slate-800">
                                    {reviewModal.match.status === 'CONFIRMED' ? 'Match Confirmado' : 'Revisar Sugerencia de Match'}
                                </h2>
                                <p className="text-xs text-slate-500">
                                    Confianza: <span className={`font-bold ${reviewModal.match.confidence >= 0.80 ? 'text-emerald-600' : reviewModal.match.confidence >= 0.60 ? 'text-blue-600' : 'text-amber-600'}`}>{(reviewModal.match.confidence * 100).toFixed(0)}%</span>
                                    {reviewModal.match.ruleApplied && <span className="ml-2 text-slate-400">| {reviewModal.match.ruleApplied}</span>}
                                    {reviewModal.match.origin && <span className="ml-2 text-slate-400">| {reviewModal.match.origin === 'AUTOMATIC' ? 'Automático' : 'Manual'}</span>}
                                </p>
                            </div>
                            <button onClick={() => setReviewModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto p-4">
                            {(() => {
                                const tx = reviewModal.match.transaction;
                                const pm = (reviewModal.match as any).payment;
                                const isTx = !!tx;
                                const mDate = tx ? tx.date : pm?.date;
                                const mAmount = tx ? Math.abs(tx.amount) : pm?.amount;
                                const mDesc = tx ? tx.description : (pm?.notes || 'Carga Manual / Registro de Pago');
                                const mBank = tx?.bankAccount?.bankName;

                                return (
                                    <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0"><BanknotesIcon className="h-3.5 w-3.5 text-red-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">{isTx ? 'Movimiento Bancario' : 'Carga Manual'}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{mDate ? formatDate(mDate) : '—'}</p></div>
                                                <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-red-700">{formatCurrency(mAmount || 0)}</p></div>
                                                <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Descripción</span><p className="text-slate-800 truncate" title={mDesc}>{mDesc}</p></div>
                                                {mBank && (
                                                    <div className="col-span-2 text-xs text-slate-500">{mBank} — {tx?.bankAccount?.accountNumber}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-indigo-200 p-4 bg-indigo-50/30">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0"><DocumentTextIcon className="h-3.5 w-3.5 text-indigo-600" /></div>
                                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Factura (DTE)</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                <div><span className="text-[10px] text-slate-400 uppercase">Fecha</span><p className="font-semibold text-slate-800">{formatDate(reviewModal.dte.issuedDate)}</p></div>
                                                <div><span className="text-[10px] text-slate-400 uppercase">Monto</span><p className="font-bold text-indigo-700">{formatCurrency(reviewModal.dte.totalAmount)}</p></div>
                                                <div className="col-span-2"><span className="text-[10px] text-slate-400 uppercase">Proveedor</span><p className="text-slate-800 truncate" title={provider?.name}>{provider?.name || '—'}</p></div>
                                                <div>Folio <span className="font-bold text-indigo-600">{reviewModal.dte.folio}</span></div>
                                                <div>T{reviewModal.dte.type}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 mt-3">
                                        <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-lg py-1.5 px-3">
                                            <span>Monto: <strong className={Math.abs(reviewModal.dte.totalAmount - (mAmount || 0)) === 0 ? 'text-emerald-600' : 'text-amber-600'}>{formatCurrency(Math.abs(reviewModal.dte.totalAmount - (mAmount || 0)))}</strong></span>
                                            {mDate && <span>Fecha: <strong className="text-slate-700">{Math.abs(Math.round((new Date(mDate).getTime() - new Date(reviewModal.dte.issuedDate).getTime()) / 86400000))} días</strong></span>}
                                        </div>
                                        <div className="flex-1 min-w-[200px]">
                                            <input
                                                value={reviewComment}
                                                onChange={e => setReviewComment(e.target.value)}
                                                placeholder="Comentario (opcional)"
                                                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500"
                                            />
                                        </div>
                                    </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3">
                            {reviewModal.match.status !== 'CONFIRMED' ? (
                                <>
                                    <button onClick={() => handleMatchAction('CONFIRMED')} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                                        <CheckCircleIcon className="h-5 w-5" /> Confirmar Match
                                    </button>
                                    <button onClick={() => handleMatchAction('REJECTED')} disabled={reviewLoading}
                                        className="flex-1 min-w-[120px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                                        <XCircleIcon className="h-5 w-5" /> Rechazar
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (!reviewModal) return;
                                            setManualMatchDte(reviewModal.dte);
                                            setManualMatchSearch(provider?.name || '');
                                            setReviewModal(null);
                                        }} 
                                        className="flex-1 min-w-[120px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-2 border-indigo-200 px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                        <MagnifyingGlassIcon className="h-4 w-4" /> Buscar en Cartola
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => { handleDiscardMatch(reviewModal.match.id); setReviewModal(null); }} disabled={reviewLoading}
                                    className="flex-1 min-w-[120px] bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                                    <XCircleIcon className="h-5 w-5" /> Desvincular match
                                </button>
                            )}
                            <button onClick={() => setReviewModal(null)} disabled={reviewLoading}
                                className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium text-sm hover:bg-slate-100 disabled:opacity-50">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {printModalOpen && provider && (
                <PrintStatementModal 
                    provider={provider as any} 
                    onClose={() => setPrintModalOpen(false)} 
                    formatCurrency={formatCurrency} 
                />
            )}
        </>
    );
}

// ── TransferBankCard: datos bancarios editables del proveedor ──

const BANK_OPTIONS = ['Santander', 'BancoEstado', 'Banco de Chile', 'BCI', 'Scotiabank', 'Itaú', 'BICE', 'Falabella', 'Ripley', 'Security', 'Otro'];
const ACCOUNT_TYPES = ['Corriente', 'Vista', 'Ahorro'];

function TransferBankCard({ provider, onSaved, formatCurrency }: {
    provider: ProviderDetail;
    onSaved: () => void;
    formatCurrency: (n: number) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        transferBankName: provider.transferBankName || '',
        transferAccountNumber: provider.transferAccountNumber || '',
        transferAccountType: provider.transferAccountType || '',
        transferRut: provider.transferRut || '',
        transferEmail: provider.transferEmail || '',
    });

    useEffect(() => {
        setForm({
            transferBankName: provider.transferBankName || '',
            transferAccountNumber: provider.transferAccountNumber || '',
            transferAccountType: provider.transferAccountType || '',
            transferRut: provider.transferRut || '',
            transferEmail: provider.transferEmail || '',
        });
    }, [provider]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const API_URL = getApiUrl();
            const res = await fetch(`${API_URL}/proveedores/${provider.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setEditing(false);
                onSaved();
            } else {
                alert('Error al guardar datos bancarios');
            }
        } finally {
            setSaving(false);
        }
    };

    const hasData = provider.transferBankName || provider.transferAccountNumber;

    return (
        <div className="card-glass overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center space-x-2">
                    <BanknotesIcon className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-700">Datos de Transferencia</h3>
                    {!hasData && !editing && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">SIN CONFIGURAR</span>
                    )}
                </div>
                {!editing ? (
                    <button onClick={() => setEditing(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center">
                        <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4.125.688.688-4.125L16.862 3.487z" /></svg>
                        Editar
                    </button>
                ) : (
                    <div className="flex space-x-2">
                        <button onClick={handleSave} disabled={saving}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={() => { setEditing(false); setForm({ transferBankName: provider.transferBankName || '', transferAccountNumber: provider.transferAccountNumber || '', transferAccountType: provider.transferAccountType || '', transferRut: provider.transferRut || '', transferEmail: provider.transferEmail || '' }); }}
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300">
                            Cancelar
                        </button>
                    </div>
                )}
            </div>

            <div className="px-6 py-4">
                {editing ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Banco</label>
                            <select value={form.transferBankName} onChange={e => setForm({ ...form, transferBankName: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="">Seleccionar banco</option>
                                {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">N° Cuenta</label>
                            <input type="text" value={form.transferAccountNumber} onChange={e => setForm({ ...form, transferAccountNumber: e.target.value })}
                                placeholder="Ej: 123456789" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Cuenta</label>
                            <select value={form.transferAccountType} onChange={e => setForm({ ...form, transferAccountType: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="">Seleccionar</option>
                                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">RUT Titular</label>
                            <input type="text" value={form.transferRut} onChange={e => setForm({ ...form, transferRut: e.target.value })}
                                placeholder="12.345.678-9" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Email Notificación</label>
                            <input type="email" value={form.transferEmail} onChange={e => setForm({ ...form, transferEmail: e.target.value })}
                                placeholder="pagos@proveedor.cl" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                    </div>
                ) : hasData ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Banco</div>
                            <div className="font-medium text-slate-900">{provider.transferBankName || '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">N° Cuenta</div>
                            <div className="font-mono font-medium text-slate-900">{provider.transferAccountNumber || '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Tipo</div>
                            <div className="font-medium text-slate-900">{provider.transferAccountType || '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">RUT Titular</div>
                            <div className="font-mono font-medium text-slate-900">{provider.transferRut || '—'}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Email</div>
                            <div className="font-medium text-slate-900 truncate">{provider.transferEmail || '—'}</div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-4 text-slate-400 text-sm">
                        No hay datos bancarios configurados. Haz clic en "Editar" para agregar.
                    </div>
                )}
            </div>
        </div>
    );
}
