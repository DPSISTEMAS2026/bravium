'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    SparklesIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

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
        title: 'Reportes',
        items: [
            { name: 'Dashboard', href: '/', icon: HomeIcon },
            { name: 'Reportes', href: '/reportes', icon: DocumentChartBarIcon },
        ]
    },
    {
        title: 'Ventas',
        items: [
            { name: 'Facturas (DTE)', href: '/facturas', icon: ShoppingBagIcon },
            { name: 'Monitor de Compras', href: '/monitor-compras', icon: ShoppingBagIcon },
        ]
    },
    {
        title: 'Pagos',
        items: [
            { name: 'Conciliación', href: '/conciliacion', icon: BanknotesIcon },
            { name: 'Pagos', href: '/pagos', icon: CreditCardIcon },
        ]
    },
    {
        title: 'Configuración',
        items: [
            { name: 'Cargar Cartola', href: '/ingestion/cartolas', icon: ArrowDownTrayIcon },
            { name: 'Proveedores', href: '/proveedores', icon: UsersIcon },
            { name: 'Exportar Datos', href: '/exportar', icon: ArrowDownTrayIcon },
        ]
    }
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const initials = user?.fullName
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase() || '??';

    return (
        <div className="sidebar d-flex flex-column">
            {/* Logo Section */}
            <div className="px-4 mb-4 d-flex align-items-center gap-2">
                <div className="bg-primary rounded-lg d-flex align-items-center justify-content-center p-1" style={{ width: '32px', height: '32px' }}>
                    <SparklesIcon className="text-white w-5 h-5" />
                </div>
                <span className="fs-5 fw-bold text-white tracking-tight uppercase" style={{ letterSpacing: '2px' }}>BRAVIUM</span>
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
                        <div className="rounded-circle bg-primary d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>
                            <span className="small fw-bold text-white">{initials}</span>
                        </div>
                        <div className="overflow-hidden">
                            <div className="text-white fw-medium text-truncate" style={{ fontSize: '0.8rem', maxWidth: '100px' }}>{user?.fullName}</div>
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
