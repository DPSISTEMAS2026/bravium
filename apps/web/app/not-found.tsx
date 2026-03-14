'use client';

import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">404 – Página no encontrada</h1>
            <p className="text-slate-600 mb-6">La ruta que buscas no existe. ¿Quisiste ir a otra sección?</p>
            <Link
                href="/dashboard"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
            >
                Ir al Dashboard
            </Link>
        </div>
    );
}
