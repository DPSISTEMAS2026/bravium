'use client';

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCartolaIngestion } from '../../contexts/CartolaIngestionContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { CartolaIngestionBar } from './CartolaIngestionBar';
import { usePathname, useRouter } from 'next/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const { active: ingestionActive } = useCartolaIngestion();
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    React.useEffect(() => {
        if (!isLoading && !user && pathname !== '/login') {
            router.push('/login');
            return;
        }

        // Redirección móvil desde el Dashboard
        if (typeof window !== 'undefined' && window.innerWidth < 768 && pathname === '/') {
            router.push('/busqueda');
        }
    }, [user, isLoading, pathname, router]);

    if (isLoading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 bg-white">
                <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Cargando...</span>
                </div>
            </div>
        );
    }

    // If we are on the login page, just show the login page content
    if (pathname === '/login') {
        return <>{children}</>;
    }

    return (
        <div className={`d-flex w-100 min-vh-100 ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
            <Sidebar />
            <div className="main-content flex-grow-1 d-flex flex-column">
                <Header onToggle={() => setIsCollapsed(!isCollapsed)} />
                <main className={`flex-grow-1 p-4 p-lg-5 ${ingestionActive ? 'pb-20' : ''}`}>
                    {children}
                </main>
            </div>
            {isCollapsed && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsCollapsed(false)} />}
            <CartolaIngestionBar />
        </div>
    );
}
