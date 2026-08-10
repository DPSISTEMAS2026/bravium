'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { preload } from 'swr';
import {
    HomeIcon,
    BanknotesIcon,
    UsersIcon,
    CreditCardIcon,
    ArrowDownTrayIcon,
    ArrowLeftOnRectangleIcon,
    ChevronRightIcon,
    SparklesIcon,
    DocumentTextIcon,
    ChevronDoubleLeftIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { getApiUrl, apiFetcher } from '../../lib/api';

interface NavItem {
    name: string;
    href: string;
    icon: any;
    mobileOnly?: boolean;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const sections: NavSection[] = [
    {
        title: 'Módulos Principales',
        items: [
            { name: 'Facturas (DTE)', href: '/facturas', icon: DocumentTextIcon },
            { name: 'Cartolas Bancarias', href: '/cartolas', icon: BanknotesIcon },
            { name: 'Conciliación Bancaria', href: '/conciliacion', icon: CreditCardIcon },
            { name: 'Proveedores', href: '/proveedores', icon: UsersIcon },
        ]
    },
    {
        title: 'Gestión y Sistema',
        items: [
            { name: 'Exportación', href: '/exportar', icon: ArrowDownTrayIcon },
            { name: 'Mi Perfil', href: '/perfil', icon: UsersIcon },
        ]
    }
];

const prefetchMap: Record<string, string[]> = {
    '/cartolas': ['/transactions/bank-accounts', '/conciliacion/files'],
    '/facturas': ['/dtes/summary'],
    '/proveedores': ['/proveedores'],
    '/reportes': ['/reportes/deuda-proveedores', '/reportes/flujo-caja'],
};

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const API_URL = getApiUrl();

    const handlePrefetch = useCallback((href: string) => {
        const endpoints = prefetchMap[href];
        if (!endpoints) return;
        const safeFetcher = (url: string) =>
            apiFetcher(url).catch(() => undefined);
        for (const ep of endpoints) {
            preload(`${API_URL}${ep}`, safeFetcher);
        }
    }, [API_URL]);

    const initials = user?.fullName
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase() || '??';

    return (
        <aside className={`sidebar d-flex flex-column transition-all duration-300 ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Logo + Collapse Toggle */}
            <div className="px-3 py-4 mb-2 flex items-center justify-between">
                <Link href="/" className="block flex-1 min-w-0 logo-container">
                    <img
                        src="/logo.svg"
                        alt="BRAVIUM Logo"
                        className="h-6 w-auto object-contain brightness-0 invert sidebar-logo"
                    />
                    <div className="sidebar-logo-icon font-extrabold text-white text-base tracking-widest hidden">
                        B
                    </div>
                </Link>
                <button
                    type="button"
                    onClick={onToggle}
                    className="sidebar-toggle-btn text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                    title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                >
                    <ChevronDoubleLeftIcon
                        className="w-4 h-4 transition-transform duration-300"
                        style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                </button>
            </div>

            {/* Sections */}
            <div className="flex-grow-1 overflow-y-auto px-2 space-y-4">
                {sections.map((section) => (
                    <div key={section.title}>
                        <div className="nav-section-title">{section.title}</div>
                        <ul className="nav nav-pills flex-column space-y-1">
                            {section.items.map((item) => {
                                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                                return (
                                    <li key={item.name} className={`nav-item ${!item.mobileOnly ? 'block' : 'md:hidden'}`}>
                                        <Link
                                            href={item.href}
                                            className={`nav-link ${active ? 'active' : ''}`}
                                            title={item.name}
                                            onMouseEnter={() => handlePrefetch(item.href)}
                                        >
                                            <item.icon className={`icon shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                                            <span className="flex-grow-1 nav-label truncate">{item.name}</span>
                                            {active && <ChevronRightIcon className="w-3.5 h-3.5 text-white opacity-80 shrink-0 nav-arrow" />}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            {/* User Profile & Logout */}
            <div className="p-2 border-t border-slate-800 mt-auto">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div className="w-8 h-8 rounded bg-blue-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                    </div>
                    <div className="min-w-0 flex-1 user-info">
                        <div className="text-xs font-bold text-white truncate">{user?.fullName || 'Usuario'}</div>
                        <div className="text-[10px] text-slate-400 truncate">{user?.email || 'admin@bravium.cl'}</div>
                    </div>
                    <button
                        onClick={logout}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors shrink-0"
                        title="Cerrar sesión"
                    >
                        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
