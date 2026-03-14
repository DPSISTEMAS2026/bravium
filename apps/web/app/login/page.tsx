'use client';

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
                    <div className="text-center bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl py-5 px-6 -mt-14 shadow-lg shadow-indigo-500/30">
                        <img src="/logo.svg" alt="Bravium" className="h-9 mx-auto" />
                    </div>
                    <p className="text-center text-slate-500 text-sm">Ingreso al Sistema Interno</p>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                            <input
                                type="email"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all bg-white"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@bravium.cl"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contraseña</label>
                            <input
                                type="password"
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all bg-white"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 hover:shadow-lg hover:shadow-indigo-500/30 transition-all mt-2"
                        >
                            Iniciar Sesión
                        </button>
                    </form>
                    <p className="text-center text-xs text-slate-400">Software de Propiedad Interna</p>
                </div>
            </div>
        </div>
    );
}
