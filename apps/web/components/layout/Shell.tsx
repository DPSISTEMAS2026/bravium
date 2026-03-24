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
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

    React.useEffect(() => {
        if (!isLoading && !user && pathname !== '/login') {
            router.push('/login');
        }
    }, [user, isLoading, pathname, router]);

    React.useEffect(() => {
        setIsSidebarOpen(false); // Close on route change
    }, [pathname]);

    if (isLoading) {
        return (
            <div className="d-flex justify-content-center align-items-center vh-100 bg-white">
                <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Cargando...</span>
                </div>
            </div>
        );
    }

    if (pathname === '/login') {
        return <>{children}</>;
    }

    if (!user && pathname !== '/login') {
        return null;
    }

    return (
        <div className="flex w-100 min-vh-100 relative">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            
            {/* Backdrop Mobile */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className="main-content flex-grow-1 flex flex-col min-w-0">
                <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
                <main className={`flex-grow-1 p-4 p-lg-5 ${ingestionActive ? 'pb-20' : ''}`}>
                    {children}
                </main>
            </div>
            <CartolaIngestionBar />
        </div>
    );
}
