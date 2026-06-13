import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

// Cal.com pill badge: rounded-full, caption size (text-xs / 13px), font-medium, px-3 py-1
const tones: Record<Tone, string> = {
  // surface-card (#f5f5f5) bottom, ink text
  neutral: 'bg-surface-card text-ink',
  // brand-50 (#f5f5f5) bottom, ink text — near-black semantic brand
  brand: 'bg-brand-50 text-ink',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
