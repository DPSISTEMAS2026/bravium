'use client';

import { useEffect, useState } from 'react';
import { KpiCard } from '../components/dashboard/KpiCard';
import { PaymentsChart } from '../components/charts/PaymentsChart';
import { ProviderTable } from '../components/dashboard/ProviderTable';

// Tipos básicos para evitar errores de compilación si no se importan
interface KpiData {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  helperText?: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiData[]>([
    { title: 'Total Pagado (Mes)', value: '-', helperText: 'Cargando...' },
    { title: 'Deuda Proveedores', value: '-', helperText: 'Cargando...' },
    { title: 'Pagos Conciliados', value: '-', helperText: 'Cargando...' },
    { title: 'Transacciones Pendientes', value: '-', helperText: 'Cargando...' },
  ]);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://bravium-backend.onrender.com';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const year = new Date().getFullYear();
        const month = new Date().getMonth() + 1;
        // Pedimos dashboard del mes actual
        const res = await fetch(`${API_URL}/conciliacion/dashboard?year=${year}&months=${month}`);
        if (!res.ok) throw new Error('Error fetching data');

        const data = await res.json();
        const summary = data.summary;

        // Formatear moneda
        const fmt = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

        // Construir KPIs reales
        const realKpis: KpiData[] = [
          {
            title: 'Total Pagado (Mes)',
            value: fmt(summary.dtes?.paid_amount || 0),
            change: 'N/A',
            changeType: 'neutral',
            helperText: `Datos de ${year}-${month.toString().padStart(2, '0')}`
          },
          {
            title: 'Deuda Pendiente',
            value: fmt(summary.dtes?.outstanding_amount || 0),
            // change: '-1.5%', // Calcular cambio requeriría dato mes anterior
            changeType: 'negative',
            helperText: 'Facturas por pagar'
          },
          {
            title: 'Conciliación',
            value: summary.matches?.match_rate || '0%',
            changeType: parseFloat(summary.matches?.match_rate || '0') > 80 ? 'positive' : 'negative',
            helperText: `${summary.matches?.total || 0} pareos confirmados`
          },
          {
            title: 'Pendientes Cartola',
            value: (summary.transactions?.pending || 0).toString(),
            changeType: (summary.transactions?.pending || 0) > 0 ? 'negative' : 'positive',
            helperText: 'Movimientos sin respaldar'
          },
        ];

        setKpis(realKpis);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        setKpis(prev => prev.map(k => ({ ...k, value: 'Error', helperText: 'Sin conexión' })));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [API_URL]);

  return (
    <>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Dashboard Ejecutivo</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <div className="btn-group me-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled>Compartir</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled>Exportar</button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="row g-4 mb-4">
        {kpis.map((kpi, idx) => (
          <div className="col-12 col-md-6 col-xl-3" key={idx}>
            <KpiCard {...kpi} />
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-lg-8">
          {/* Wrapper for Chart */}
          <div className="card h-100">
            <div className="card-header bg-white py-3">
              <h5 className="card-title mb-0">Flujo de Pagos</h5>
            </div>
            <div className="card-body">
              <PaymentsChart />
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card h-100 text-center d-flex align-items-center justify-content-center bg-light border-dashed">
            <div className="p-5">
              <h5 className="text-muted">Distribución de Gastos</h5>
              <p className="small text-muted mb-0">Próximamente: Gráficos de Categorías</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ranking & Products Row */}
      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <ProviderTable />
        </div>
        <div className="col-12 col-lg-6">
          <div className="card h-100">
            <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">Mejores Productos (Ahorro)</h5>
              <span className="badge bg-secondary">Próximamente</span>
            </div>
            <div className="card-body d-flex align-items-center justify-content-center">
              <div className="text-center text-muted">
                <p>El Módulo de Inteligencia de Compras se integrará aquí.</p>
                <div className="progress w-50 mx-auto mt-3" style={{ height: '6px' }}>
                  <div className="progress-bar progress-bar-striped progress-bar-animated bg-info" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

