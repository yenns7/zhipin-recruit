import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent' | 'glass' | 'info' | 'purple' | 'teal';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'border border-hairline bg-surface-card text-ink',
  brand: 'border border-[rgba(0,192,123,0.32)] bg-[var(--enterprise-brand-soft)] text-[var(--enterprise-brand-dark)]',
  success: 'border border-[#b7eb8f] bg-[#f6ffed] text-[#52a611]',
  warning: 'border border-[#ffe2a8] bg-[#fff7e6] text-[#b56a00]',
  danger: 'border border-[#ffc7c7] bg-[#fff1f0] text-[#d9363e]',
  accent: 'border border-[#b8ddff] bg-[#edf6ff] text-[#1e6fd9]',
  info: 'border border-[#b8ddff] bg-[#edf6ff] text-[#1e6fd9]',
  purple: 'border border-purple-200 bg-purple-50 text-purple-700',
  teal: 'border border-teal-200 bg-teal-50 text-teal-700',
  glass: 'border border-hairline bg-white text-ink',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold transition-all duration-200',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
