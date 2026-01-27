import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/react/24/solid';

interface KpiCardProps {
    title: string;
    value: string;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    helperText?: string;
}

export function KpiCard({ title, value, change, changeType, helperText }: KpiCardProps) {
    let changeClass = 'text-muted';
    let Icon = MinusIcon;

    if (changeType === 'positive') {
        changeClass = 'text-success';
        Icon = ArrowUpIcon;
    } else if (changeType === 'negative') {
        changeClass = 'text-danger';
        Icon = ArrowDownIcon;
    }

    return (
        <div className="card h-100">
            <div className="card-body">
                <h6 className="card-subtitle mb-2 text-muted text-uppercase small fw-bold">{title}</h6>
                <div className="d-flex align-items-baseline justify-content-between">
                    <h2 className="card-title mb-0">{value}</h2>
                    {change && (
                        <span className={`badge bg-light ${changeClass} border d-flex align-items-center`}>
                            <Icon style={{ width: 12, height: 12, marginRight: 4 }} />
                            {change}
                        </span>
                    )}
                </div>
                {helperText && <small className="text-muted mt-2 d-block">{helperText}</small>}
            </div>
        </div>
    );
}
