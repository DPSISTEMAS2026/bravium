'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    HomeIcon,
    BanknotesIcon,
    DocumentTextIcon,
    ClipboardDocumentCheckIcon,
    ArrowPathIcon,
    ChartBarIcon,
    UserGroupIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';

const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Conciliación', href: '/conciliacion', icon: ClipboardDocumentCheckIcon },
    { name: 'Proveedores', href: '/proveedores', icon: UserGroupIcon },
    { name: 'Facturas (DTE)', href: '/facturas', icon: DocumentTextIcon },
    { name: 'Pagos', href: '/pagos', icon: BanknotesIcon },
    { name: 'Cartolas Bancarias', href: '/cartolas', icon: ArrowPathIcon },
    { name: 'Reportes', href: '/reportes', icon: ChartBarIcon },
];

export default function Sidebar() {
    const pathname = usePathname();

    const isActive = (href: string) => {
        if (href === '/') {
            return pathname === '/';
        }
        return pathname?.startsWith(href);
    };

    return (
        <div className="flex flex-col w-64 h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white shadow-2xl fixed left-0 top-0 border-r border-slate-800">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 bg-gradient-to-r from-blue-600 to-purple-600 relative overflow-hidden">
                <SparklesIcon className="h-6 w-6 mr-2 text-white animate-pulse" />
                <span className="font-bold text-xl tracking-wider">BRAVIUM</span>
                <div className="absolute inset-0 bg-white/10 shimmer"></div>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-6 scrollbar-thin">
                <nav className="space-y-1 px-3">
                    {navigation.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`
                                    group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200
                                    ${active
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/50'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }
                                `}
                            >
                                <item.icon
                                    className={`mr-3 h-5 w-5 flex-shrink-0 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'
                                        }`}
                                    aria-hidden="true"
                                />
                                <span className="flex-1">{item.name}</span>
                                {active && (
                                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* User Profile */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                <div className="flex items-center group cursor-pointer hover:bg-slate-800 p-2 rounded-lg transition-all duration-200">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg">
                        AD
                    </div>
                    <div className="ml-3 flex-1">
                        <p className="text-sm font-semibold text-white">Admin User</p>
                        <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                            Ver Perfil
                        </p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                </div>
            </div>
        </div>
    );
}
