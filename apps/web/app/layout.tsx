import React from 'react';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { TenantProvider } from '../contexts/TenantContext';
import { CartolaIngestionProvider } from '../contexts/CartolaIngestionContext';
import { SWRProvider } from '../components/providers/SWRProvider';
import { Shell } from '../components/layout/Shell';

export const metadata = {
    title: 'DP Sistemas | Gestión Contable',
    description: 'Plataforma de gestión contable y automatizaciones',
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
                    <TenantProvider>
                        <AuthProvider>
                            <CartolaIngestionProvider>
                                <Shell>
                                    {children}
                                </Shell>
                            </CartolaIngestionProvider>
                        </AuthProvider>
                    </TenantProvider>
                </SWRProvider>
            </body>
        </html>
    );
}
