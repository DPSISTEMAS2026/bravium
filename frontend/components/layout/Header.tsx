'use client';

import { BellIcon, MagnifyingGlassIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

export default function Header() {
    const [notifications] = useState(3);

    return (
        <header className="ml-64 h-16 bg-white border-b border-slate-200 fixed top-0 right-0 left-64 z-10 shadow-sm">
            <div className="h-full px-8 flex items-center justify-between">
                {/* Search Bar */}
                <div className="flex-1 max-w-2xl">
                    <div className="relative">
                        <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar facturas, proveedores, transacciones..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm transition-all duration-200 hover:border-slate-400"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-4">
                    {/* Notifications */}
                    <button className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200">
                        <BellIcon className="h-6 w-6" />
                        {notifications > 0 && (
                            <span className="absolute top-1 right-1 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                                {notifications}
                            </span>
                        )}
                    </button>

                    {/* Settings */}
                    <button className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200">
                        <Cog6ToothIcon className="h-6 w-6" />
                    </button>

                    {/* Sync Status */}
                    <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-xs font-medium text-emerald-700">
                            Sincronizado
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
}
