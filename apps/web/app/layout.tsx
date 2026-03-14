import React from 'react';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { CartolaIngestionProvider } from '../contexts/CartolaIngestionContext';
import { SWRProvider } from '../components/providers/SWRProvider';
import { Shell } from '../components/layout/Shell';

export const metadata = {
    title: 'Bravium | Conciliación Inteligente',
    description: 'Sistema financiero para empresas modernas',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className="bg-slate-50 text-slate-900 font-sans antialiased">
                <SWRProvider>
                    <AuthProvider>
                        <CartolaIngestionProvider>
                            <Shell>
                                {children}
                            </Shell>
                        </CartolaIngestionProvider>
                    </AuthProvider>
                </SWRProvider>
            </body>
        </html>
    );
}
