'use client';

import React from 'react';
import { BanknotesIcon, DocumentTextIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

type ExecutiveKPIGridProps = {
    transactions: {
        total: number;
        matched: number;
        pending: number;
        match_rate: string;
        total_amount: number;
    };
    dtes: {
        total: number;
        paid: number;
        unpaid: number;
        partially_paid: number;
        payment_rate: string;
        total_amount: number;
        outstanding_amount: number;
    };
    matches: {
        total: number;
        confirmed: number;
        automatic: number;
        manual: number;
        auto_rate: string;
    };
};

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
    }).format(amount);
}

export function ExecutiveKPIGrid(props: ExecutiveKPIGridProps) {
    const { transactions, dtes, matches } = props;

    const cards = [
        {
            name: 'Cobertura Bancaria Conciliada',
            stat: transactions.match_rate,
            detail: `${transactions.matched.toLocaleString('es-CL')} de ${transactions.total.toLocaleString('es-CL')} transacciones`,
            icon: CheckCircleIcon,
        },
        {
            name: 'Transacciones Pendientes',
            stat: transactions.pending.toLocaleString('es-CL'),
            detail: `${formatCurrency(transactions.total_amount)} en cartolas`,
            icon: ClockIcon,
        },
        {
            name: 'Deuda Documental Pendiente',
            stat: formatCurrency(dtes.outstanding_amount),
            detail: `${dtes.unpaid.toLocaleString('es-CL')} DTEs por saldar`,
            icon: DocumentTextIcon,
        },
        {
            name: 'Precisión de Motor v4',
            stat: matches.auto_rate,
            detail: `${matches.automatic.toLocaleString('es-CL')} coincidencias de RUT`,
            icon: BanknotesIcon,
        },
    ];

    return (
        <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Indicadores Clave de Cuadratura</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((item) => {
                    const IconComponent = item.icon;
                    return (
                        <div key={item.name} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-600 truncate">{item.name}</span>
                                <IconComponent className="h-4 w-4 text-slate-600 shrink-0" />
                            </div>
                            <div className="mt-3 text-2xl font-extrabold text-slate-900 font-mono tracking-tight">
                                {item.stat}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500 font-medium truncate">
                                {item.detail}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
