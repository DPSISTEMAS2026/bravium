import { BellIcon } from '@heroicons/react/24/outline';

export default function Header() {
    return (
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 fixed right-0 left-64 top-0 z-10">
            <div className="flex items-center">
                <h2 className="text-xl font-semibold text-slate-800">
                    Panel Principal
                </h2>
            </div>

            <div className="flex items-center space-x-6">
                {/* Organization Switcher Placeholder */}
                <div className="flex items-center space-x-2 border-r border-slate-200 pr-6">
                    <span className="text-sm text-slate-500">Organización:</span>
                    <select className="text-sm font-medium bg-transparent border-none focus:ring-0 text-slate-700">
                        <option>Empresa Demo SpA</option>
                        <option>Holding Inversiones</option>
                    </select>
                </div>

                {/* Alerts / Notifications */}
                <button className="relative text-slate-400 hover:text-slate-600">
                    <BellIcon className="h-6 w-6" />
                    <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                </button>
            </div>
        </header>
    );
}
