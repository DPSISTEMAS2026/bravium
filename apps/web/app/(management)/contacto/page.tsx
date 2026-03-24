import Link from 'next/link';
import { EnvelopeIcon } from '@heroicons/react/24/outline';

export default function ContactoPage() {
    return (
        <div className="max-w-2xl mx-auto py-16 flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
            <div className="bg-blue-50 p-4 rounded-full text-blue-600 mb-6 shadow-xl shadow-blue-600/5">
                <EnvelopeIcon className="h-12 w-12" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Contacto / Soporte</h1>
            <p className="text-slate-500 max-w-md mb-6">
                Módulo en desarrollo. Pronto tendrás estas funciones disponibles para enviar tickets de ayuda, revisar manuales o contactar con tu ejecutivo.
            </p>
            <div className="flex items-center gap-4">
                <Link href="/" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/10 flex items-center">
                    Ir al Dashboard
                </Link>
            </div>
        </div>
    );
}
