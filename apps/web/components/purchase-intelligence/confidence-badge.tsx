import { clsx } from 'clsx';

interface ConfidenceBadgeProps {
    score: number;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
    let color = 'bg-gray-100 text-gray-800';
    let label = 'Baja';

    if (score >= 80) {
        color = 'bg-green-100 text-green-800';
        label = 'Alta';
    } else if (score >= 50) {
        color = 'bg-yellow-100 text-yellow-800';
        label = 'Media';
    }

    return (
        <span
            className={clsx(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                color
            )}
            title={`Score de confianza: ${score}/100`}
        >
            {label} ({score}%)
        </span>
    );
}
