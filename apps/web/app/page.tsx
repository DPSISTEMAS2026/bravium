import { KpiCard } from '../components/dashboard/KpiCard';
import { PaymentsChart } from '../components/charts/PaymentsChart'; // Reusing existing one, just wrapper changed usually
import { ProviderTable } from '../components/dashboard/ProviderTable';

// Mock Data
const kpis = [
  { title: 'Total Pagado (Mes)', value: '$12.4M', change: '+4.7%', changeType: 'positive' as const, helperText: 'vs mes anterior' },
  { title: 'Deuda Proveedores', value: '$3.2M', change: '-1.5%', changeType: 'positive' as const, helperText: 'Vence en 30 días' },
  { title: 'Pagos Conciliados', value: '92%', change: '+12%', changeType: 'positive' as const, helperText: 'Última sinc: Hoy' },
  { title: 'Alertas Activas', value: '3', change: '+1', changeType: 'negative' as const, helperText: 'Requieren atención' },
];

export default function DashboardPage() {
  return (
    <>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
        <h1 className="h2">Dashboard Ejecutivo</h1>
        <div className="btn-toolbar mb-2 mb-md-0">
          <div className="btn-group me-2">
            <button type="button" className="btn btn-sm btn-outline-secondary">Compartir</button>
            <button type="button" className="btn btn-sm btn-outline-secondary">Exportar</button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="row g-4 mb-4">
        {kpis.map((kpi) => (
          <div className="col-12 col-md-6 col-xl-3" key={kpi.title}>
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
              <p className="small text-muted mb-0">Gráfico Circular (Placeholder)</p>
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
