
"use client";

import { DocumentTextIcon, BanknotesIcon, ChartBarIcon, ClockIcon } from '@heroicons/react/24/outline';

const tools = [
    {
        title: 'PAGOS DEL MES',
        description: 'Resumen completo de todos los pagos realizados en el mes actual',
        icon: BanknotesIcon,
        color: 'bg-blue-100 text-blue-600',
        action: 'Generar Reporte'
    },
    {
        title: 'FACTURAS PENDIENTES',
        description: 'Listado de facturas pendientes de pago con fechas de vencimiento',
        icon: DocumentTextIcon,
        color: 'bg-yellow-100 text-yellow-600',
        action: 'Generar Reporte'
    },
    {
        title: 'ESTADO DE CONCILIACIÓN',
        description: 'Reporte de conciliaciones realizadas y pendientes',
        icon: ChartBarIcon,
        color: 'bg-green-100 text-green-600',
        action: 'Generar Reporte'
    },
    {
        title: 'ANÁLISIS POR PROVEEDOR',
        description: 'Resumen de pagos y facturas por proveedor',
        icon: ChartBarIcon,
        color: 'bg-indigo-100 text-indigo-600',
        action: 'Generar Reporte'
    },
    {
        title: 'CIERRE MENSUAL',
        description: 'Reporte completo para cierre contable mensual',
        icon: DocumentTextIcon,
        color: 'bg-purple-100 text-purple-600',
        action: 'Generar Reporte'
    }
];

export default function ReportesPage() {
    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
                <p className="text-sm text-gray-500">Generación de reportes y análisis financiero</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tools.map((tool, index) => (
                    <div key={index} className="bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xs font-bold text-gray-500 tracking-wider uppercase">{tool.title}</h3>
                                <div className={`p-2 rounded-lg ${tool.color} flex items-center justify-center`}>
                                    <tool.icon className="h-5 w-5" style={{ width: '20px', height: '20px' }} />
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-6 h-10 line-clamp-2">
                                {tool.description}
                            </p>
                            <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                <ArrowDownTrayIconMini className="h-4 w-4" />
                                {tool.action}
                            </button>
                        </div>
                    </div>
                ))}

                {/* Custom Report Card */}
                <div className="bg-white overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow border-dashed">
                    <div className="p-6 flex flex-col justify-center h-full">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xs font-bold text-pink-500 tracking-wider uppercase">REPORTE PERSONALIZADO</h3>
                            <div className="p-2 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center">
                                <ChartBarIcon className="h-5 w-5" style={{ width: '20px', height: '20px' }} />
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            Crear reporte personalizado con filtros específicos
                        </p>
                        <button className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors">
                            Configurar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ArrowDownTrayIconMini({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
        </svg>
    );
}
