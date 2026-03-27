'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiUrl } from '../lib/api';

interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    organizationId: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Proactive refresh interval: 50 minutes (token expires in 60min) */
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const API_URL = getApiUrl();
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Proactive silent refresh: renew tokens before they expire
    const proactiveRefresh = useCallback(async () => {
        const refreshToken = localStorage.getItem('bravium_refresh_token');
        if (!refreshToken) return;

        try {
            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.access_token && data.refresh_token) {
                    localStorage.setItem('bravium_token', data.access_token);
                    localStorage.setItem('bravium_refresh_token', data.refresh_token);
                }
            }
        } catch {
            // Silent fail - the reactive interceptor in authFetch will handle it
        }
    }, [API_URL]);

    const startRefreshTimer = useCallback(() => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = setInterval(proactiveRefresh, REFRESH_INTERVAL_MS);
    }, [proactiveRefresh]);

    const stopRefreshTimer = useCallback(() => {
        if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const savedUser = localStorage.getItem('bravium_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
            startRefreshTimer();
        }
        setIsLoading(false);

        return () => stopRefreshTimer();
    }, [startRefreshTimer, stopRefreshTimer]);

    const login = async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass }),
        });

        const data = await res.json();
        if (data.access_token) {
            localStorage.setItem('bravium_token', data.access_token);
            localStorage.setItem('bravium_refresh_token', data.refresh_token);
            localStorage.setItem('bravium_user', JSON.stringify(data.user));
            setUser(data.user);
            startRefreshTimer();
            
            const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
            router.push(isMobile ? '/busqueda' : '/');
        } else {
            throw new Error(data.error || 'Login failed');
        }
    };

    const logout = () => {
        stopRefreshTimer();
        localStorage.removeItem('bravium_token');
        localStorage.removeItem('bravium_refresh_token');
        localStorage.removeItem('bravium_user');
        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

