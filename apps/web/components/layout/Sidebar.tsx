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
    DocumentChartBarIcon,
    ArrowDownTrayIcon,
    ArrowLeftOnRectangleIcon,
    ShoppingBagIcon,
    ChevronRightIcon,
    SparklesIcon,
    DocumentTextIcon,
    ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { getApiUrl, apiFetcher } from '../../lib/api';

interface NavItem {
    name: string;
    href: string;
    icon: any;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const sections: NavSection[] = [
    {
        title: 'Módulos Principales',
        items: [
            { name: 'Dashboard', href: '/', icon: HomeIcon },
            { name: 'Facturas (DTE)', href: '/facturas', icon: DocumentTextIcon },
            { name: 'Cartolas Bancarias', href: '/cartolas', icon: CreditCardIcon },
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
    '/registro-pagos': ['/payment-records/summary'],
    '/reportes': ['/reportes/deuda-proveedores', '/reportes/flujo-caja'],
};

export default function Sidebar() {
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
        <div className="sidebar d-flex flex-column transition-all">
            {/* Logo Section */}
            <div className="px-5 py-4 mb-2 d-flex align-items-center justify-content-center">
                <Link href="/" className="d-block">
                    <img
                        src="/logo.svg"
                        alt="BRAVIUM Logo"
                        className="img-fluid"
                        style={{ height: '24px', width: 'auto' }}
                    />
                </Link>
            </div>

            {/* Sections */}
            <div className="flex-grow-1 overflow-auto px-2">
                {sections.map((section) => (
                    <div key={section.title} className="mb-4">
                        <div className="nav-section-title">{section.title}</div>
                        <ul className="nav nav-pills flex-column">
                            {section.items.map((item) => {
                                const active = pathname === item.href;
                                return (
                                    <li key={item.name} className="nav-item">
                                        <Link
                                            href={item.href}
                                            className={`nav-link ${active ? 'active' : ''}`}
                                            onMouseEnter={() => handlePrefetch(item.href)}
                                        >
                                            <item.icon className="icon" />
                                            <span className="flex-grow-1">{item.name}</span>
                                            {active && <ChevronRightIcon style={{ width: '12px', height: '12px', opacity: 0.6 }} />}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            {/* BOTTOM FOOTER SECTION */}
            <div className="mt-auto">
                {/* Support Buttons */}
                <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">¿Necesitas ayuda?</label>
                    <div className="flex gap-2">
                        <a href="https://wa.me/56965524190" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 border border-emerald-500/20 text-xs font-semibold transition-all">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            <span>WhatsApp</span>
                        </a>
                        <a href="mailto:contacto@dpsistemas.cl" className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 hover:text-teal-300 border border-teal-500/20 text-xs font-semibold transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>Correo</span>
                        </a>
                    </div>
                </div>

                {/* Logout Footer */}
                <div className="px-3 pb-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                    >
                        <ArrowLeftOnRectangleIcon className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">Cerrar sesión</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
