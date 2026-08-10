import React from 'react';
import './globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { TenantProvider } from '../contexts/TenantContext';
import { CartolaIngestionProvider } from '../contexts/CartolaIngestionContext';
import { SWRProvider } from '../components/providers/SWRProvider';
import { Shell } from '../components/layout/Shell';

export const metadata = {
    title: 'DP Sistemas | Mantenimiento',
    description: 'Plataforma en mantenimiento',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className="bg-[#f8f9fa] text-slate-900 font-sans antialiased min-h-screen m-0 p-0">
                <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
                    {/* Contenedor central */}
                    <div className="flex-1 flex flex-col items-center justify-center px-4 w-full relative z-10 -mt-10">
                        {/* Logo */}
                        <div className="relative mb-12">
                            <div className="absolute inset-0 bg-teal-300 blur-[80px] opacity-30 rounded-full w-full h-full transform scale-150" />
                            <img src="/logo-dp.png" alt="DP Sistemas" className="h-[120px] object-contain relative z-10" />
                        </div>
                        
                        {/* 3 puntos teal */}
                        <div className="flex gap-2 mb-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#39b3be]"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-[#82c8d2]"></div>
                            <div className="w-1.5 h-1.5 rounded-full bg-[#bde0e5]"></div>
                        </div>
                        
                        {/* Texto principal */}
                        <h1 className="text-[34px] sm:text-[40px] font-bold text-[#0f2136] text-center leading-[1.1] mb-6 tracking-tight">
                            Estamos haciendo<br />algunos cambios.
                        </h1>
                        
                        {/* Texto secundario */}
                        <div className="text-center text-[#6e7781] font-medium text-[15px] space-y-1">
                            <p>La plataforma se encuentra temporalmente en mantenimiento.</p>
                            <p>Volveremos pronto.</p>
                        </div>
                    </div>
                    
                    {/* Footer fijo abajo */}
                    <div className="w-full py-8 text-center text-[11px] font-semibold text-[#a5abb1] absolute bottom-0 uppercase tracking-wide">
                        DP Sistemas y Automatizaciones
                    </div>
                </main>
                
                {/* Oculto para que Next.js no falle en build por no renderizar children ni providers */}
                <div style={{ display: 'none' }} aria-hidden="true">
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
                </div>
            </body>
        </html>
    );
}
