'use client';

import { useState, useMemo } from 'react';
import { DocumentArrowDownIcon, XMarkIcon } from '@heroicons/react/24/outline';

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
}

const DTE_TYPE_LABELS: Record<number, string> = { 33: 'Factura', 34: 'F. Exenta', 61: 'Nota Crédito', 56: 'Nota Débito' };

export default function PrintStatementModal({ provider, onClose, formatCurrency }: {
    provider: ProviderDetail;
    onClose: () => void;
    formatCurrency: (n: number) => string;
}) {
    const [dateRange, setDateRange] = useState({
        from: '2026-01-01',
        to: new Date().toISOString().split('T')[0]
    });

    const exportRows = useMemo(() => {
        const rows: Array<{
             isDte: boolean;
             folio: number | string;
             dteDate: string;
             dteAmount: number | null;
             paymentDate: string | null;
             paymentAmount: number | null;
             description: string;
             timestamp: number;
        }> = [];

        (provider.dtes || []).forEach(dte => {
            const hasMatches = dte.matches && dte.matches.length > 0;
            const confirmedMatches = hasMatches ? dte.matches.filter(m => m.status === 'CONFIRMED') : [];
            
            const dteDate = dte.issuedDate.split('T')[0];
            const inRange = dteDate >= dateRange.from && dteDate <= dateRange.to;
            
            if (confirmedMatches.length > 0) {
                confirmedMatches.forEach((match, idx) => {
                    const mDate = match.transaction?.date?.split('T')[0];
                    if (inRange || (mDate && mDate >= dateRange.from && mDate <= dateRange.to)) {
                        rows.push({
                            isDte: true,
                            folio: dte.folio,
                            dteDate: dte.issuedDate,
                            dteAmount: idx === 0 ? dte.totalAmount : null,
                            paymentDate: match.transaction?.date || null,
                            paymentAmount: match.transaction ? Math.abs(match.transaction.amount) : null,
                            description: match.transaction?.description || 'Abono/Pago',
                            timestamp: new Date(match.transaction?.date || dte.issuedDate).getTime()
                        });
                    }
                });
            } else {
                if (inRange) {
                    rows.push({
                        isDte: true,
                        folio: dte.folio,
                        dteDate: dte.issuedDate,
                        dteAmount: dte.totalAmount,
                        paymentDate: null,
                        paymentAmount: null,
                        description: dte.paymentStatus === 'PAID' ? 'Pagado (Manual)' : 'Pendiente de Pago',
                        timestamp: new Date(dte.issuedDate).getTime()
                    });
                }
            }
        });

        (provider.payments || []).forEach(p => {
             const pDate = p.paymentDate.split('T')[0];
             if (pDate >= dateRange.from && pDate <= dateRange.to) {
                 rows.push({
                     isDte: false,
                     folio: '—',
                     dteDate: '—',
                     dteAmount: null,
                     paymentDate: p.paymentDate,
                     paymentAmount: Math.abs(p.amount),
                     description: p.reference || 'Registro Pago',
                     timestamp: new Date(p.paymentDate).getTime()
                 });
             }
        });

        const aliasMovements = (provider as any).aliasMovements || [];
        aliasMovements.forEach((m: any) => {
            const mDate = m.date.split('T')[0];
            if (mDate >= dateRange.from && mDate <= dateRange.to) {
                rows.push({
                     isDte: false,
                     folio: '—',
                     dteDate: '—',
                     dteAmount: null,
                     paymentDate: m.date,
                     paymentAmount: Math.abs(m.amount),
                     description: m.description || 'Mov. Alias',
                     timestamp: new Date(m.date).getTime()
                });
            }
        });

        return rows.sort((a, b) => a.timestamp - b.timestamp);
    }, [provider, dateRange]);

    const handlePrint = async () => {
        const printContent = document.getElementById('printable-statement');
        if (!printContent) return;

        let logoBase64 = '';
        try {
            const response = await fetch('/logo.svg');
            const svgText = await response.text();
            const darkSvg = svgText.replace(/fill="white"/g, 'fill="#1e293b"');
            logoBase64 = `data:image/svg+xml,${encodeURIComponent(darkSvg)}`;
        } catch (e) {
            console.error('Error loading logo for print:', e);
        }

        const win = window.open('', '', 'height=700,width=1000');
        if (!win) return;

        let htmlContent = printContent.innerHTML;
        if (logoBase64) {
            htmlContent = htmlContent.replace(/src="[^"]*logo\.svg"/, `src="${logoBase64}"`);
        }

        win.document.write(`
            <html>
                <head>
                    <title>Estado de Cuenta - ${provider.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
                        body { font-family: 'Inter', sans-serif; color: #1e293b; margin: 0; padding: 30px; font-size: 11px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0; }
                        .title { font-size: 18px; font-weight: 800; margin-bottom: 5px; color: #0f172a; }
                        .provider-info { margin-bottom: 30px; }
                        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .th { background: #f8fafc; text-align: left; padding: 10px; font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
                        .td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
                        .amount-dte { text-align: right; font-weight: 600; color: #0f172a; }
                        .amount-payment { text-align: right; font-weight: 600; color: #16a34a; }
                        .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 10px; }
                    </style>
                </head>
                <body>${htmlContent}</body>
            </html>
        `);
        win.document.close(); win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center space-x-2">
                            <DocumentArrowDownIcon className="h-5 w-5 text-indigo-600" />
                            <span>Exportar Estado de Cuenta</span>
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-all">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-4 flex-wrap">
                    <div className="flex items-center space-x-2 border rounded-xl px-3 py-1.5 text-sm">
                        <label className="text-slate-500 text-xs font-semibold">Desde</label>
                        <input type="date" value={dateRange.from} onChange={e => setDateRange({ ...dateRange, from: e.target.value })} className="border-0 bg-transparent focus:ring-0 p-0 text-slate-700 font-medium text-xs" />
                    </div>
                    <div className="flex items-center space-x-2 border rounded-xl px-3 py-1.5 text-sm">
                        <label className="text-slate-500 text-xs font-semibold">Hasta</label>
                        <input type="date" value={dateRange.to} onChange={e => setDateRange({ ...dateRange, to: e.target.value })} className="border-0 bg-transparent focus:ring-0 p-0 text-slate-700 font-medium text-xs" />
                    </div>
                    <button onClick={handlePrint} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg flex items-center space-x-2 ml-auto">
                        <span>Imprimir / PDF</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50" id="printable-statement">
                    <div className="header">
                        <div>
                            <div className="title">ESTADO DE CUENTA</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Rango: {formatDate(dateRange.from)} - {formatDate(dateRange.to)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <img src="/logo.svg" style={{ height: '32px', objectFit: 'contain' }} alt="Logo" />
                        </div>
                    </div>

                    <div className="provider-info">
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#0f172a' }}>{provider.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>RUT: {provider.rut}</div>
                    </div>

                    {exportRows.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>
                            Sin movimientos registrados en este periodo.
                        </div>
                    ) : (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="th" style={{ width: '80px' }}>Folio</th>
                                    <th className="th">Emisión</th>
                                    <th className="th" style={{ textAlign: 'right' }}>Monto DTE</th>
                                    <th className="th" style={{ borderLeft: '2px solid #f1f5f9', paddingLeft: '15px' }}>Fecha Pago</th>
                                    <th className="th" style={{ textAlign: 'right' }}>Monto Pago</th>
                                    <th className="th">Detalle del Pago</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exportRows.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="td" style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>{row.folio}</td>
                                        <td className="td" style={{ whiteSpace: 'nowrap' }}>{row.dteDate !== '—' ? formatDate(row.dteDate) : '—'}</td>
                                        <td className="td amount-dte">{row.dteAmount !== null ? formatCurrency(row.dteAmount) : '—'}</td>
                                        <td className="td" style={{ whiteSpace: 'nowrap', borderLeft: '2px solid #f1f5f9', paddingLeft: '15px' }}>{row.paymentDate ? formatDate(row.paymentDate) : '—'}</td>
                                        <td className="td amount-payment">{row.paymentAmount !== null ? formatCurrency(row.paymentAmount) : '—'}</td>
                                        <td className="td" style={{ fontSize: '10px', color: '#64748b' }}>{row.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
