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
    ArrowLeftOnRectangleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Conciliación', href: '/conciliacion', icon: BanknotesIcon },
    { name: 'Cargar Cartola', href: '/ingestion/cartolas', icon: ArrowDownTrayIcon },
    { name: 'Proveedores', href: '/proveedores', icon: UsersIcon },
    { name: 'Pagos', href: '/pagos', icon: CreditCardIcon },
    { name: 'Reportes', href: '/reportes', icon: DocumentChartBarIcon },
    { name: 'Exportar', href: '/exportar', icon: ArrowDownTrayIcon },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const initials = user?.fullName
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase() || '??';

    return (
        <div className="d-flex flex-column flex-shrink-0 p-3 text-white bg-dark sidebar">
            <div className="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-white text-decoration-none px-3 mt-2">
                <img src="/logo.svg" alt="Bravium" className="h-8 w-auto" style={{ maxHeight: '40px' }} />
            </div>
            <hr />
            <ul className="nav nav-pills flex-column mb-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <li className="nav-item" key={item.name}>
                            <Link
                                href={item.href}
                                className={`nav-link d-flex align-items-center gap-2 ${isActive ? 'active' : ''}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <item.icon style={{ width: '20px', height: '20px' }} />
                                {item.name}
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <hr />
            <div className="px-3">
                <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                        <div className="rounded-circle bg-primary d-flex justify-content-center align-items-center me-2" style={{ width: 32, height: 32 }}>
                            <span className="small fw-bold">{initials}</span>
                        </div>
                        <div>
                            <div className="small fw-bold" style={{ fontSize: '13px' }}>{user?.fullName || 'Usuario'}</div>
                            <div className="text-secondary" style={{ fontSize: '10px' }}>{user?.role}</div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="btn btn-link text-secondary p-0 ms-2"
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
