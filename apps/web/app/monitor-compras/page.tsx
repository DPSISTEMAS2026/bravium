
"use client";

import { ShoppingBagIcon, SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function MonitorComprasPage() {
    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 mb-1">Monitor de Compras</h1>
                <p className="text-sm text-slate-500 font-medium tracking-tight">Comparativa de precios de mercado e inteligencia de abastecimiento.</p>
            </div>

            {/* Coming Soon / Integration Phase */}
            <div className="flex flex-col items-center justify-center p-20 card-glass border-2 border-dashed border-slate-200">
                <div className="p-6 bg-slate-50 rounded-full mb-6">
                    <SparklesIcon className="h-16 w-16 text-slate-300" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Inteligencia de Abastecimiento</h2>
                <p className="text-slate-500 text-center max-w-md mb-8">
                    El Monitor de Compras está en proceso de integración con las APIs de comparación de mercado para ofrecerte variaciones de precios en tiempo real basadas en tus facturas.
                </p>
                <div className="animate-pulse flex items-center space-x-2 text-slate-400 font-medium text-sm">
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    <span>Sincronizando modelos de precios...</span>
                </div>
            </div>
        </div>
    );
}
