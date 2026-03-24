'use client';

import { BellIcon, ArrowLeftOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

export default function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
    const { user, logout } = useAuth();

    return (
        <header className="header shadow-sm flex items-center justify-between w-full overflow-hidden px-4">
            {/* Hamburger Mobile */}
            <button
                type="button"
                className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                onClick={onToggleSidebar}
            >
                <Bars3Icon className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 sm:gap-4 px-2 sm:px-4 min-w-0 flex-1 justify-end flex-nowrap">
                {/* Status */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700 font-semibold text-xs">EN LÍNEA</span>
                </div>

                {/* Notifications */}
                <button
                    type="button"
                    disabled
                    title="Notificaciones (pronto)"
                    className="p-2 text-slate-400 rounded-lg hover:bg-slate-100 disabled:opacity-70 transition-colors shrink-0"
                >
                    <BellIcon className="w-5 h-5" />
                </button>

                {/* User + Logout: email trunca, boton siempre visible */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
                    <span className="hidden sm:inline-block text-slate-600 text-sm font-medium truncate max-w-[180px] lg:max-w-[220px]" title={user?.email ?? ''}>
                        {user?.email}
                    </span>
                    <div className="hidden sm:block w-px h-5 bg-slate-200 shrink-0" />
                    <button
                        type="button"
                        onClick={logout}
                        title="Cerrar sesión"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors shrink-0 border border-transparent hover:border-red-100"
                    >
                        <ArrowLeftOnRectangleIcon className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium whitespace-nowrap">Cerrar sesión</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
