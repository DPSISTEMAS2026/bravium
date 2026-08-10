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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Desglose de Cuadratura Mensual</h3>
        <p className="mt-0.5 text-xs text-slate-500 font-medium">
          Progreso por periodo mensual entre facturas de compra y movimientos bancarios.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100/70 border-b border-slate-200">
            <tr>
              <th scope="col" className="py-2.5 px-4 font-bold text-slate-700 uppercase tracking-wider">Mes</th>
              <th scope="col" className="py-2.5 px-4 font-bold text-slate-700 uppercase tracking-wider text-center" colSpan={3}>Documentos DTE</th>
              <th scope="col" className="py-2.5 px-4 font-bold text-slate-700 uppercase tracking-wider text-center" colSpan={3}>Cartolas Bancarias</th>
            </tr>
            <tr className="bg-slate-50 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-2 px-4">Periodo</th>
              <th className="py-2 px-4 text-center">Recibidos / Pagados</th>
              <th className="py-2 px-4 text-center">Impagos</th>
              <th className="py-2 px-4 text-center">Avance</th>
              <th className="py-2 px-4 text-center border-l border-slate-200">Total / Conciliados</th>
              <th className="py-2 px-4 text-center">Pendientes</th>
              <th className="py-2 px-4 text-center">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {data.map((m) => {
              const dtePct = parseFloat(m.dtes.payment_rate);
              const txPct = parseFloat(m.transactions.match_rate);
              return (
                <tr key={`${m.month}-${m.year}`} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {m.month} {m.year}
                  </td>
                  
                  {/* DTEs */}
                  <td className="py-3 px-4 text-center font-mono text-slate-700">
                    <span className="font-bold text-slate-900">{m.dtes.total}</span> / <span className="font-bold text-slate-900">{m.dtes.paid}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                      {m.dtes.unpaid} DTEs
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                    {m.dtes.payment_rate}
                  </td>

                  {/* Banco */}
                  <td className="py-3 px-4 text-center font-mono text-slate-700 border-l border-slate-200">
                    <span className="font-bold text-slate-900">{m.transactions.total}</span> / <span className="font-bold text-slate-900">{m.transactions.matched}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                      {m.transactions.pending} txs
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                    {m.transactions.match_rate}
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
