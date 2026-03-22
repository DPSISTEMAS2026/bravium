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
            { name: 'Contacto', href: '/contacto', icon: DocumentChartBarIcon },
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

            {/* Logout Footer */}
            <div className="mt-auto px-3 pb-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                    onClick={logout}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                >
                    <ArrowLeftOnRectangleIcon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">Cerrar sesión</span>
                </button>
            </div>
        </div>
    );
}
