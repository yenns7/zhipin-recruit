import type { ReactNode } from 'react';
import { AnimatedNumber } from '../motion';
import { Card, CardBody } from '../ui';

interface KpiCardProps {
  label: string;
  value: number | null | ReactNode;
  sub?: string;
  accent?: string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

function isNumericValue(value: KpiCardProps['value']): value is number | null {
  return typeof value === 'number' || value === null;
}

export function KpiCard({
  label,
  value,
  sub,
  accent,
  decimals = 0,
  prefix = '',
  suffix = '',
}: KpiCardProps) {
  return (
    <Card variant="elevated" className="overflow-hidden">
      <CardBody className="relative px-5 py-5">
        {accent && (
          <div
            className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-10"
            style={{ background: accent }}
          />
        )}
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <div className="text-2xl font-display text-ink tabular-nums md:text-3xl">
          {isNumericValue(value) ? (
            value === null ? (
              <span className="text-muted-soft">—</span>
            ) : (
              <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
            )
          ) : (
            value
          )}
        </div>
        {sub && <p className="mt-0.5 text-xs text-muted-soft">{sub}</p>}
      </CardBody>
    </Card>
  );
}
