import type { ReactNode } from 'react';

interface MetricTileProps {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'neutral' | 'danger' | 'warning' | 'success';
}

export function MetricTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: MetricTileProps) {
  const toneClass = {
    neutral: 'text-ink',
    danger: 'text-danger-700',
    warning: 'text-warning-700',
    success: 'text-success-700',
  }[tone];

  return (
    <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-display ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-soft">{sub}</p>}
    </div>
  );
}
