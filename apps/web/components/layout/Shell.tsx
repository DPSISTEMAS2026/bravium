'use client';

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
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
            <div className="d-flex justify-content-center align-items-center vh-100">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    // If we are on the login page, just show the login page content
    if (pathname === '/login') {
        return <>{children}</>;
    }

    // If not authenticated and not on login page, we should ideally redirect,
    // but the LoginPage itself already handles some logic.
    // For the Shell, if no user, we might show a minimal layout or nothing.
    if (!user && pathname !== '/login') {
        // The AuthContext effect will handle the redirect eventually, 
        // but we return nothing here to avoid flashing the dashboard.
        return null;
    }

    return (
        <div className="d-flex w-100">
            <aside>
                <Sidebar />
            </aside>
            <div className="main-content w-100">
                <Header />
                <main className="container-fluid px-4 py-4">
                    {children}
                </main>
            </div>
        </div>
    );
}
