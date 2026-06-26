import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'glass' | 'info' | 'purple' | 'teal';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-card text-ink',
  brand: 'bg-brand-50 text-ink',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  accent: 'bg-blue-50 text-accent-blue',
  info: 'bg-sky-50 text-sky-700',
  purple: 'bg-purple-50 text-purple-700',
  teal: 'bg-teal-50 text-teal-700',
  glass: 'glass-subtle text-ink',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all duration-200',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}