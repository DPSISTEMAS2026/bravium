'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getApiUrl, apiFetcher, authFetch } from '@/lib/api';
import { TrashIcon, PlusIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface AutoCategoryRule {
    id: string;
    keywordMatch: string;
    categoryName: string;
    createdAt: string;
    isActive: boolean;
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val);

function RuleRow({ rule, onDelete }: { rule: AutoCategoryRule; onDelete: (id: string) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const API_URL = getApiUrl();
    
    // Only fetch when expanded to save bandwidth
    const { data: txs, isLoading } = useSWR(
        isExpanded ? `${API_URL}/conciliacion/rules/${rule.id}/transactions` : null, 
        apiFetcher
    );

    return (
        <>
            <tr 
                className="hover:bg-slate-50 transition-colors cursor-pointer group"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <td className="px-6 py-4">
                    <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-800 font-mono text-sm font-bold rounded-lg border border-indigo-200">
                        {rule.keywordMatch}
                    </span>
                </td>
                <td className="px-6 py-4">
                    <span className="font-semibold text-slate-700">
                        {rule.categoryName}
                    </span>
                </td>
                <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${rule.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {rule.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                </td>
                <td className="px-6 py-4 text-right">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(rule.id); }}
                        className="p-2 text-rose-500 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar regla"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-slate-50/50 border-b border-slate-200">
                    <td colSpan={4} className="p-0">
                        <div className="px-8 py-6 ring-1 ring-inset ring-slate-100 bg-slate-50/50">
                            <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <SparklesIcon className="h-4 w-4 text-indigo-500" />
                                Historial de Cargos Relacionados
                            </h4>
                            {isLoading ? (
                                <div className="text-sm text-slate-500 animate-pulse">Cargando movimientos...</div>
                            ) : txs && txs.length > 0 ? (
                                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-100/50 text-xs text-slate-500 uppercase">
                                            <tr>
                                                <th className="px-4 py-3">Fecha</th>
                                                <th className="px-4 py-3">Glosa Banco</th>
                                                <th className="px-4 py-3">Pestaña / Cuenta</th>
                                                <th className="px-4 py-3 text-right">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {txs.map((tx: any) => (
                                                <tr key={tx.id} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                                        {new Date(tx.date).toLocaleDateString('es-CL')}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-800 font-medium">
                                                        {tx.description}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                                        {tx.bankAccount?.name}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-rose-600">
                                                        {formatCurrency(tx.amount)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 text-xs border-t border-slate-200">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 font-bold text-right text-slate-600">Total Histórico:</td>
                                                <td className="px-4 py-3 font-bold text-right text-rose-700">
                                                    {formatCurrency(txs.reduce((sum: number, tx: any) => sum + tx.amount, 0))}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-sm text-slate-500 bg-white p-4 rounded-xl border border-slate-200 text-center">
                                    No hay movimientos registrados bajo esta regla aún.
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

export default function GastosFijosPage() {
    const API_URL = getApiUrl();
    const { data: rules = [], mutate, isLoading } = useSWR<AutoCategoryRule[]>(`${API_URL}/conciliacion/rules`, apiFetcher);

    const [isAdding, setIsAdding] = useState(false);
    const [keywordMatch, setKeywordMatch] = useState('');
    const [categoryName, setCategoryName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAddRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keywordMatch || !categoryName) return;

        setIsSubmitting(true);
        try {
            const res = await authFetch(`${API_URL}/conciliacion/rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywordMatch, categoryName })
            });

            if (!res.ok) throw new Error('Error al crear regla');
            
            // Refetch
            mutate();
            setIsAdding(false);
            setKeywordMatch('');
            setCategoryName('');
        } catch (err) {
            alert('Falló la creación de la regla. Verifica los datos.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta regla? Ya no se categorizarán futuros pagos automáticamente.')) return;

        try {
            const res = await authFetch(`${API_URL}/conciliacion/rules/${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Error al eliminar regla');
            
            // Refetch
            mutate();
        } catch (err) {
            alert('Falló la eliminación.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gradient-to-r from-indigo-900 to-purple-900 p-8 rounded-2xl shadow-xl text-white">
                <div>
                    <h1 className="text-3xl font-extrabold flex items-center gap-3">
                        <SparklesIcon className="w-8 h-8 text-amber-400" /> 
                        Gastos Fijos y Reglas
                    </h1>
                    <p className="mt-2 text-indigo-200">
                        Entrena al motor de conciliación para que detecte y categorice automáticamente transacciones recurrentes basadas en palabras clave (ej: &quot;COMUNIDAD EDIFICIO&quot;).
                    </p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center px-4 py-2 bg-white text-indigo-900 rounded-xl font-bold hover:bg-indigo-50 shadow-lg transition-transform transform hover:scale-105"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Nueva Regla
                </button>
            </div>

            {isAdding && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-100 flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Palabra Clave (Glosa Bancaria)</label>
                        <input
                            type="text"
                            placeholder='Ej: "COMUNIDAD", "AGUAS ANDINAS", "ENEL"'
                            value={keywordMatch}
                            onChange={(e) => setKeywordMatch(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Categoría Asignada</label>
                        <input
                            type="text"
                            placeholder='Ej: "Gasto Común", "Servicios Básicos"'
                            value={categoryName}
                            onChange={(e) => setCategoryName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                        <button
                            onClick={handleAddRule}
                            disabled={isSubmitting || !keywordMatch || !categoryName}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                        >
                            Guardar Regla
                        </button>
                        <button
                            onClick={() => setIsAdding(false)}
                            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors"
                            title="Cancelar"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {rules.length === 0 ? (
                    <div className="text-center py-16 px-4">
                        <SparklesIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-700">Sin reglas activas</h3>
                        <p className="text-slate-500 mt-2 max-w-md mx-auto">
                            Comienza a agregar palabras clave que aparecen en tus cartolas bancarias. El sistema las leerá y categorizará automáticamente.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50/80 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Palabra Clave Sensible</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Se asignará a Categoría</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rules.map((rule) => (
                                <RuleRow key={rule.id} rule={rule} onDelete={handleDeleteRule} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
