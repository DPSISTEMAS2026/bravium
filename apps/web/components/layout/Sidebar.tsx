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
    ShoppingBagIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Conciliación', href: '/conciliacion', icon: BanknotesIcon },
    { name: 'Monitor de Compras', href: '/monitor-compras', icon: ShoppingBagIcon },
    { name: 'Cargar Cartola', href: '/ingestion/cartolas', icon: ArrowDownTrayIcon },
    { name: 'Proveedores', href: '/proveedores', icon: UsersIcon },
    { name: 'Pagos', href: '/pagos', icon: CreditCardIcon },
    { name: 'Reportes', href: '/reportes', icon: DocumentChartBarIcon },
    { name: 'Exportar', href: '/exportar', icon: ArrowDownTrayIcon },
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
        <div className="d-flex flex-column flex-shrink-0 p-3 text-white sidebar">
            <div className="d-flex align-items-center mb-0 text-white text-decoration-none px-3 mt-2" style={{ height: '40px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="Bravium" style={{ height: '32px', width: 'auto', display: 'block' }} />
            </div>
            <hr />
            <ul className="nav nav-pills flex-column mb-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <li className="nav-item mb-1" key={item.name}>
                            <Link
                                href={item.href}
                                className={`nav-link d-flex align-items-center gap-2 py-2 ${isActive ? 'active shadow-sm' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <item.icon style={{ width: '18px', height: '18px' }} />
                                <span style={{ fontSize: '14px' }}>{item.name}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <hr />
            <div className="px-1 mt-auto">
                <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                        <div className="rounded-circle bg-primary d-flex justify-content-center align-items-center me-2 text-white shadow-sm" style={{ width: 32, height: 32 }}>
                            <span className="small fw-bold">{initials}</span>
                        </div>
                        <div className="overflow-hidden">
                            <div className="small fw-bold text-truncate" style={{ fontSize: '13px', maxWidth: '100px' }}>{user?.fullName || 'Usuario'}</div>
                            <div className="text-white-50 text-truncate" style={{ fontSize: '10px' }}>{user?.role}</div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="btn btn-link text-white-50 p-0 ms-2 hover-white"
                        title="Cerrar Sesión"
                        style={{ border: 'none', background: 'none' }}
                    >
                        <ArrowLeftOnRectangleIcon style={{ width: 18, height: 18 }} />
                    </button>
                </div>
            </div>
        </div>
    );
}
