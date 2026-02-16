import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/react/24/solid';

interface KpiCardProps {
    title: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    icon?: any;
}

export default function KpiCard({ title, value, trend, trendDirection = 'neutral', icon: Icon }: KpiCardProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-900">{value}</h3>

                {trend && (
                    <div className={`flex items-center mt-2 text-sm font-medium
            ${trendDirection === 'up' ? 'text-green-600' :
                            trendDirection === 'down' ? 'text-red-600' : 'text-slate-500'}
          `}>
                        {trendDirection === 'up' && <ArrowUpIcon className="h-3 w-3 mr-1" />}
                        {trendDirection === 'down' && <ArrowDownIcon className="h-3 w-3 mr-1" />}
                        {trendDirection === 'neutral' && <MinusIcon className="h-3 w-3 mr-1" />}
                        <span>{trend}</span>
                    </div>
                )}
            </div>

            {Icon && (
                <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                    <Icon className="h-6 w-6" />
                </div>
            )}
        </div>
    );
}
