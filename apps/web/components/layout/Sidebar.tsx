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
        title: 'Reportes e Inteligencia',
        items: [
            { name: 'Dashboard', href: '/', icon: HomeIcon },
            { name: 'Análisis de Reportes', href: '/reportes', icon: DocumentChartBarIcon },
        ]
    },
    {
        title: 'Operaciones DTE',
        items: [
            { name: 'Facturas (DTE)', href: '/facturas', icon: DocumentTextIcon },
            { name: 'Monitor de Compras', href: '/monitor-compras', icon: ShoppingBagIcon },
        ]
    },
    {
        title: 'Bancos y Conciliación',
        items: [
            { name: 'Cartolas Bancarias', href: '/cartolas', icon: CreditCardIcon },
            { name: 'Conciliación (KPIs)', href: '/conciliacion', icon: SparklesIcon },
            { name: 'Libro de Pagos', href: '/registro-pagos', icon: BanknotesIcon },
        ]
    },
    {
        title: 'Gestión y Sistema',
        items: [
            { name: 'Proveedores', href: '/proveedores', icon: UsersIcon },
            { name: 'Exportar Información', href: '/exportar', icon: ArrowDownTrayIcon },
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

            {/* Logout Footer Layer */}
            <div className="mt-auto pt-3 border-top border-white opacity-10 px-3 pb-3">
                <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                        <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--bravium-active-indigo), var(--bravium-active-violet))' }}>
                            <span className="small fw-bold text-white">{initials}</span>
                        </div>
                        <div className="overflow-hidden">
                            <div className="text-white fw-medium text-truncate" style={{ fontSize: '0.8rem', maxWidth: '120px' }}>{user?.fullName}</div>
                        </div>
                    </div>
                    <button onClick={logout} className="p-1 text-white opacity-50 hover-opacity-100 transition-all bg-transparent border-0">
                        <ArrowLeftOnRectangleIcon style={{ width: '18px', height: '18px' }} />
                    </button>
                </div>
            </div>
        </div>
    );
}
