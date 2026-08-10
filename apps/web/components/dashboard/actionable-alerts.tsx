'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

type ActionableAlertsFeaturesProps = {
    pendingTransactions: number;
    pendingDtes: number;
    unmatchedHighValueTx: number;
    unmatchedHighValueDtes: number;
};

export function ActionableAlertsFeatures(props: ActionableAlertsFeaturesProps) {
    const alerts = [
        {
            id: 'pending-tx',
            title: `${props.pendingTransactions.toLocaleString('es-CL')} transacciones bancarias sin conciliar`,
            description: 'Movimientos de cartola pendientes de vinculación o revisión contable.',
            href: '/conciliacion',
        },
        {
            id: 'pending-dtes',
            title: `${props.pendingDtes.toLocaleString('es-CL')} DTEs impagos en sistema`,
            description: 'Facturas de compra con saldo pendiente de pago registrado.',
            href: '/facturas',
        },
        {
            id: 'high-value',
            title: 'Movimientos de alto valor sin vincular',
            description: `${props.unmatchedHighValueTx} transacciones y ${props.unmatchedHighValueDtes} DTEs superiores a $1.000.000 CLP.`,
            href: '/conciliacion',
        },
    ];

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Plan de Acción Contable</h3>
            <div className="space-y-3">
                {alerts.map((alert) => (
                    <div
                        key={alert.id}
                        className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-4 hover:bg-slate-100/80 transition-colors"
                    >
                        <div>
                            <h4 className="text-xs font-bold text-slate-900">{alert.title}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">{alert.description}</p>
                        </div>
                        <Link
                            href={alert.href}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
                        >
                            <span>Gestionar</span>
                            <ArrowRightIcon className="h-3 w-3" />
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
