'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useCartolaIngestion } from '../../contexts/CartolaIngestionContext';

const STEP_LABELS: Record<string, { short: string; long: string }> = {
    uploading: { short: 'Subiendo y procesando...', long: 'Extrayendo movimientos con IA. Puedes navegar por el sitio.' },
    matching: { short: 'Conciliando...', long: 'Buscando coincidencias con facturas.' },
    done: { short: 'Listo', long: 'Cartola procesada correctamente.' },
    error: { short: 'Error', long: 'Revisa el mensaje de error.' },
};

export function CartolaIngestionBar() {
    const { active, fileName, step, errorMessage, insertedRows, dismissBar } = useCartolaIngestion();
    const [progress, setProgress] = useState(0);

    // Barra de progreso simulada durante uploading/matching para dar sensación de avance
    useEffect(() => {
        if (!active || !step || (step !== 'uploading' && step !== 'matching')) {
            setProgress(step === 'done' ? 100 : step === 'error' ? 100 : 0);
            return;
        }
        const start = Date.now();
        const duration = 90000; // 90 s máximo hasta llegar a 85%
        const target = 85;
        const t = setInterval(() => {
            const elapsed = Date.now() - start;
            const p = Math.min(target, (elapsed / duration) * target);
            setProgress(p);
        }, 500);
        return () => clearInterval(t);
    }, [active, step]);

    useEffect(() => {
        if (step === 'done' || step === 'error') setProgress(100);
    }, [step]);

    if (!active) return null;

    const labels = step ? STEP_LABELS[step] : { short: 'Procesando...', long: '' };
    const isDone = step === 'done' || step === 'error';

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-slate-200 shadow-lg shadow-slate-200/80">
            <div className="max-w-4xl mx-auto px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                    {step === 'uploading' && (
                        <div className="flex-shrink-0 w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {step === 'matching' && (
                        <div className="flex-shrink-0 w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {isDone && (
                        step === 'done'
                            ? <CheckCircleIcon className="h-6 w-6 text-emerald-500 flex-shrink-0" />
                            : <XCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">
                            {labels?.short ?? 'Procesando cartola'}
                            {fileName && <span className="text-slate-500 font-normal ml-1">— {fileName}</span>}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {step === 'error' && errorMessage ? errorMessage : labels?.long}
                            {step === 'done' && insertedRows !== undefined && ` ${insertedRows} movimientos insertados.`}
                        </p>
                    </div>
                    {(step === 'done' || step === 'error') && (
                        <button
                            type="button"
                            onClick={dismissBar}
                            className="flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                            Cerrar
                        </button>
                    )}
                </div>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 rounded-full ${
                            step === 'done' ? 'bg-emerald-500' :
                            step === 'error' ? 'bg-red-500' :
                            'bg-indigo-500'
                        }`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
