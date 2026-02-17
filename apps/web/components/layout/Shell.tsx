'use client';

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import Header from './Header';
import { usePathname, useRouter } from 'next/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    React.useEffect(() => {
        if (!isLoading && !user && pathname !== '/login') {
            router.push('/login');
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

    if (!user && pathname !== '/login') {
        return null; // Avoid flashing dashboard
    }

    return (
        <div className="d-flex w-100 min-vh-100">
            <Sidebar />
            <div className="main-content flex-grow-1 d-flex flex-column">
                <Header />
                <main className="flex-grow-1 p-4 p-lg-5">
                    {children}
                </main>
            </div>
        </div>
    );
}
