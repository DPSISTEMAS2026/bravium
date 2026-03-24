'use client';

import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getApiUrl, authFetch } from '../../../lib/api';
import { LockClosedIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

export default function ProfilePage() {
    const { user } = useAuth();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setMessage({ text: 'Las contraseñas nuevas no coinciden', type: 'error' });
            return;
        }

        if (newPassword.length < 6) {
            setMessage({ text: 'La contraseña debe tener al menos 6 caracteres', type: 'error' });
            return;
        }

        setLoading(true);

        try {
            const API_URL = getApiUrl();
            const res = await authFetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword })
            });

            const data = await res.json();

            if (data.error) {
                setMessage({ text: data.error, type: 'error' });
            } else if (data.success) {
                setMessage({ text: 'Contraseña actualizada correctamente', type: 'success' });
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (err: any) {
            setMessage({ text: 'Error al conectar con el servidor', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto py-10">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-fade-in-up">
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-6 py-8 text-white">
                    <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center font-bold text-xl">
                            {user?.fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || '??'}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">{user?.fullName || 'Usuario'}</h1>
                            <p className="text-xs text-indigo-100">{user?.email}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h2 className="text-slate-800 font-bold text-sm uppercase tracking-wider mb-2 flex items-center">
                        <LockClosedIcon className="h-4 w-4 mr-1 text-indigo-600" />
                        Cambiar Contraseña
                    </h2>

                    {message && (
                        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center space-x-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {message.type === 'success' ? <CheckCircleIcon className="h-4 w-4 shrink-0" /> : <ExclamationCircleIcon className="h-4 w-4 shrink-0" />}
                            <span>{message.text}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña Actual</label>
                        <input
                            type="password"
                            required
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                            placeholder="••••••••"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña Nueva</label>
                        <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                            placeholder="••••••••"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar Contraseña Nueva</label>
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                            placeholder="••••••••"
                        />
                    </div>

                    <p className="text-[10px] text-slate-400">
                        * Se recomienda combinar letras y números para mayor seguridad.
                    </p>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-indigo-600/10 flex items-center justify-center space-x-2"
                    >
                        {loading ? 'Guardando...' : 'Actualizar Contraseña'}
                    </button>
                </form>
            </div>
        </div>
    );
}
