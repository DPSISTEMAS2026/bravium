import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    HomeIcon,
    BanknotesIcon,
    DocumentTextIcon,
    ClipboardDocumentCheckIcon,
    ArrowPathIcon,
    ChartBarIcon,
    UserGroupIcon
} from '@heroicons/react/24/outline';

const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Proveedores', href: '/proveedores', icon: UserGroupIcon },
    { name: 'Facturas (DTE)', href: '/facturas', icon: DocumentTextIcon },
    { name: 'Pagos', href: '/pagos', icon: BanknotesIcon },
    { name: 'Conciliación', href: '/conciliacion', icon: ClipboardDocumentCheckIcon },
    { name: 'Cartolas Bancarias', href: '/cartolas', icon: ArrowPathIcon },
    { name: 'Reportes y Cierre', href: '/reportes', icon: ChartBarIcon },
];

export default function Sidebar() {
    return (
        <div className="flex flex-col w-64 h-screen bg-slate-900 text-white shadow-xl fixed left-0 top-0">
            <div className="h-16 flex items-center px-6 bg-slate-950 font-bold text-xl tracking-wider">
                BRAVIUM
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-4">
                    {navigation.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`
                flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors
                hover:bg-slate-800 hover:text-white
                text-slate-300
              `}
                        >
                            <item.icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
                            {item.name}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
                        AD
                    </div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-white">Admin User</p>
                        <p className="text-xs text-slate-400">View Profile</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
