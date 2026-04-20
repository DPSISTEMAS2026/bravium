'use client';

import React from 'react';

type MonthlyStats = {
  month: string;
  year: number;
  dtes: { total: number; paid: number; unpaid: number; payment_rate: string };
  transactions: { total: number; matched: number; pending: number; match_rate: string };
};

export function MonthlyBreakdownGrid({ data }: { data: MonthlyStats[] }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden mt-8">
      <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-base font-semibold leading-7 text-gray-900">Métricas de Conciliación por Mes</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
          Progreso mensual de cuadratura entre documentos recibidos y movimientos bancarios.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Mes</th>
              <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900" colSpan={3}>Facturas (Folios)</th>
              <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900" colSpan={3}>Banco (Cartolas)</th>
            </tr>
            <tr className="bg-white border-b border-gray-200">
              <th scope="col" className="py-2 pl-6 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"></th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Recibidas / Pagadas</th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Pendientes</th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Avance</th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Txs / Conciliadas</th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Sueltas</th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((m) => {
              const dtePct = parseFloat(m.dtes.payment_rate);
              const txPct = parseFloat(m.transactions.match_rate);
              return (
                <tr key={`${m.month}-${m.year}`} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {m.month} {m.year}
                  </td>
                  
                  {/* Facturas */}
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-600">
                    <span className="font-medium text-gray-900">{m.dtes.total}</span> / <span className="text-emerald-600 font-medium">{m.dtes.paid}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${m.dtes.unpaid > 0 ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10'}`}>
                      {m.dtes.unpaid} dtes
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                     <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-200">
                            <div className={`h-1.5 rounded-full ${dtePct >= 90 ? 'bg-emerald-500' : dtePct >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${dtePct}%` }}></div>
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-9">{m.dtes.payment_rate}</span>
                     </div>
                  </td>

                  {/* Banco */}
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center text-gray-600 border-l border-gray-100">
                    <span className="font-medium text-gray-900">{m.transactions.total}</span> / <span className="text-blue-600 font-medium">{m.transactions.matched}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${m.transactions.pending > 0 ? 'bg-pink-50 text-pink-700 ring-1 ring-inset ring-pink-600/20' : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10'}`}>
                      {m.transactions.pending} txs
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-center">
                     <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-200">
                            <div className={`h-1.5 rounded-full ${txPct >= 90 ? 'bg-emerald-500' : txPct >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${txPct}%` }}></div>
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-9">{m.transactions.match_rate}</span>
                     </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
