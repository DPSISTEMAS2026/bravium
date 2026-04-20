import { ExecutiveKPIGrid } from '../../components/dashboard/executive-kpi-grid';
import { ActionableAlertsFeatures } from '../../components/dashboard/actionable-alerts';
import { MonthlyBreakdownGrid } from '../../components/dashboard/monthly-breakdown';
import { fetchConciliacionDashboard } from '../../lib/api';

function isoDate(d: Date) {
    return d.toISOString().slice(0, 10);
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
    }).format(amount);
}

/** Período por defecto para KPIs e informes: solo 2026 (LibreDTE vs cartolas). Filtros en otras pantallas permiten ver 2025. */
const REPORT_YEAR = 2026;

export default async function DashboardPage() {
    const now = new Date();
    const from = new Date(Date.UTC(REPORT_YEAR, 0, 1)); // 2026-01-01
    const to = now.getUTCFullYear() === REPORT_YEAR
        ? now
        : new Date(Date.UTC(REPORT_YEAR, 11, 31)); // 2026-12-31 si estamos en 2027+

    const dashboard = await fetchConciliacionDashboard({
        fromDate: isoDate(from),
        toDate: isoDate(to),
    });

    return (
        <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
                <h1 className="text-2xl font-semibold text-gray-900">Dashboard (datos reales)</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Período: {dashboard.period.from} → {dashboard.period.to} (solo {REPORT_YEAR} para KPIs e informes)
                </p>
            </div>

            <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
                <div className="py-4">
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div className="space-y-8">
                            <ExecutiveKPIGrid
                                transactions={dashboard.summary.transactions}
                                dtes={dashboard.summary.dtes}
                                matches={dashboard.summary.matches}
                            />
                            
                            {/* Detailed metrics by month */}
                            <MonthlyBreakdownGrid data={dashboard.monthly_breakdown} />

                            <div className="overflow-hidden rounded-lg bg-white shadow">
                                <div className="p-6">
                                    <h3 className="text-base font-semibold leading-6 text-gray-900 mb-2">Pendientes (Top)</h3>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Transacciones pendientes: <span className="font-semibold">{dashboard.summary.transactions.pending}</span> · DTEs impagos:{' '}
                                        <span className="font-semibold">{dashboard.summary.dtes.unpaid}</span>
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {(dashboard.pending.transactions || []).slice(0, 5).map((tx) => (
                                            <div key={tx.id} className="rounded-lg border border-gray-200 p-3">
                                                <div className="text-xs text-gray-500">{tx.bankAccount?.bankName || 'Banco'} · {tx.date.slice(0, 10)}</div>
                                                <div className="text-sm font-medium text-gray-900 truncate">{tx.description}</div>
                                                <div className={`text-sm font-semibold ${tx.type === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {formatCurrency(tx.amount)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <ActionableAlertsFeatures
                                pendingTransactions={dashboard.summary.transactions.pending}
                                pendingDtes={dashboard.summary.dtes.unpaid}
                                unmatchedHighValueTx={dashboard.insights.high_value_unmatched.transactions.length}
                                unmatchedHighValueDtes={dashboard.insights.high_value_unmatched.dtes.length}
                            />

                            <div className="bg-white shadow sm:rounded-lg">
                                <div className="px-4 py-5 sm:p-6">
                                    <h3 className="text-base font-semibold leading-6 text-gray-900">Matches recientes</h3>
                                    <ul role="list" className="divide-y divide-gray-100 mt-4">
                                        {dashboard.recent_matches.length === 0 ? (
                                            <li className="py-2 text-sm text-gray-500">Sin matches recientes en este período.</li>
                                        ) : (
                                            dashboard.recent_matches.slice(0, 6).map((m) => (
                                                <li key={m.id} className="flex gap-x-4 py-3">
                                                    <div className="flex-auto min-w-0">
                                                        <p className="text-sm font-semibold leading-6 text-gray-900 truncate">
                                                            {m.transaction.description}
                                                        </p>
                                                        <p className="mt-1 truncate text-xs leading-5 text-gray-500">
                                                            {m.transaction.date.slice(0, 10)} · {formatCurrency(m.transaction.amount)} · {m.origin} · {m.ruleApplied}
                                                        </p>
                                                    </div>
                                                    <time className="flex-none text-xs text-gray-500 py-0.5">
                                                        {new Date(m.createdAt).toLocaleString('es-CL')}
                                                    </time>
                                                </li>
                                            ))
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
