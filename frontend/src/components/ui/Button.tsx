import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

// base: rounded-md (8px) per Cal.com spec, font-semibold (600), neutral focus ring
const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // near-black primary — brand-600=#111111, brand-700=#242424, on-primary=white
  primary: 'bg-brand-600 text-on-primary hover:bg-brand-700',
  // white canvas + hairline border + ink text
  secondary:
    'bg-canvas text-ink border border-hairline hover:bg-surface-soft hover:border-surface-strong',
  // transparent, muted text, hover to surface-soft
  ghost: 'bg-transparent text-muted hover:bg-surface-soft hover:text-ink',
  // semantic danger
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
