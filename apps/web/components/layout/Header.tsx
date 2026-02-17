'use client';

import {
    BellIcon,
    ArrowLeftOnRectangleIcon,
    UserCircleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

export default function Header() {
    const { user, logout } = useAuth();

    return (
        <header className="header shadow-sm">
            <div className="container-fluid d-flex justify-content-end align-items-center gap-4">
                {/* Status Indicator */}
                <div className="d-flex align-items-center gap-2 px-3 py-1 bg-light rounded-pill border">
                    <div className="bg-success rounded-circle" style={{ width: '8px', height: '8px' }}></div>
                    <span className="text-success fw-bold" style={{ fontSize: '11px' }}>SINCRO</span>
                </div>

                {/* Notifications */}
                <button className="bg-transparent border-0 text-muted p-1 hover-primary transition-all position-relative">
                    <BellIcon style={{ width: '20px', height: '20px' }} />
                    <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle" style={{ width: '6px', height: '6px' }}></span>
                </button>

                {/* User Info & Quick Logout */}
                <div className="user-info">
                    <span className="d-none d-md-inline fw-medium text-slate-600">{user?.email}</span>
                    <div className="vr h-100 mx-1"></div>
                    <button
                        onClick={logout}
                        className="bg-transparent border-0 text-muted p-1 hover-danger transition-all"
                        title="Cerrar Sesión"
                    >
                        <ArrowLeftOnRectangleIcon style={{ width: '20px', height: '20px' }} />
                    </button>
                </div>
            </div>
        </header>
    );
}
