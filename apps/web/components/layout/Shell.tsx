'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCartolaIngestion } from '../../contexts/CartolaIngestionContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { CartolaIngestionBar } from './CartolaIngestionBar';
import { usePathname, useRouter } from 'next/navigation';

const SIDEBAR_STORAGE_KEY = 'bravium-sidebar-collapsed';

export function Shell({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const { active: ingestionActive } = useCartolaIngestion();

    // Desktop collapse = sidebar hidden; Mobile collapse = sidebar shown (drawer)
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    // Restore desktop sidebar state from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (stored === 'true') {
            setIsCollapsed(true);
        }

        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (!isLoading && !user && pathname !== '/login') {
            router.push('/login');
            return;
        }

        // Redirección móvil desde el Dashboard
        if (typeof window !== 'undefined' && window.innerWidth < 768 && pathname === '/') {
            router.push('/busqueda');
        }
    }, [user, isLoading, pathname, router]);

    // Close mobile drawer on route change
    useEffect(() => {
        if (isMobile && isCollapsed) {
            setIsCollapsed(false);
        }
         
    }, [pathname]);

    const handleToggle = useCallback(() => {
        setIsCollapsed(prev => {
            const next = !prev;
            // Only persist on desktop (collapse = hidden)
            if (!isMobile) {
                localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
            }
            return next;
        });
    }, [isMobile]);

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
            <Sidebar isCollapsed={!isMobile ? isCollapsed : !isCollapsed} onToggle={handleToggle} />
            <div className="main-content flex-grow-1 d-flex flex-column">
                <Header onToggle={handleToggle} isCollapsed={isCollapsed} isMobile={isMobile} />
                <main className={`flex-grow-1 p-4 p-lg-5 ${ingestionActive ? 'pb-20' : ''}`}>
                    {children}
                </main>
            </div>
            {/* Mobile overlay */}
            <div className="sidebar-overlay" onClick={handleToggle} />
            <CartolaIngestionBar />
        </div>
    );
}
