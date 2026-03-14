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

    // Orden: lo más relevante para conciliación primero (pendientes, transacciones, deuda DTE, detalle matches)
    const cards = [
        {
            name: 'Pendientes de conciliar',
            stat: transactions.pending.toLocaleString('es-CL'),
            sub: `${transactions.matched.toLocaleString('es-CL')} ya conciliadas`,
        },
        {
            name: 'Transacciones bancarias',
            stat: transactions.total.toLocaleString('es-CL'),
            sub: `${transactions.match_rate} conciliadas`,
        },
        {
            name: 'Deuda DTE pendiente',
            stat: formatCurrency(dtes.outstanding_amount),
            sub: `${dtes.unpaid.toLocaleString('es-CL')} impagos · ${dtes.paid.toLocaleString('es-CL')} pagados`,
        },
        {
            name: 'Matches automáticos',
            stat: matches.automatic.toLocaleString('es-CL'),
            sub: `${matches.auto_rate} del total (${matches.total.toLocaleString('es-CL')})`,
        },
    ];

    return (
        <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900">Resumen (datos reales)</h3>
            <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((item) => (
                    <div key={item.name} className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">{item.name}</dt>
                        <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                            {item.stat}
                        </dd>
                        <dd className="mt-1 text-sm text-gray-500">{item.sub}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
