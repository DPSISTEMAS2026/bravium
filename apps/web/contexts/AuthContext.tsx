'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const API_URL = getApiUrl();

    useEffect(() => {
        const savedUser = localStorage.getItem('bravium_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setIsLoading(false);
    }, []);

    const login = async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass }),
        });

        const data = await res.json();
        if (data.access_token) {
            localStorage.setItem('bravium_token', data.access_token);
            localStorage.setItem('bravium_user', JSON.stringify(data.user));
            setUser(data.user);
            router.push('/');
        } else {
            throw new Error(data.error || 'Login failed');
        }
    };

    const logout = () => {
        localStorage.removeItem('bravium_token');
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
