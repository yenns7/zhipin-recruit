import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const base =
  'inline-flex items-center justify-center gap-2 font-semibold ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'active:scale-[0.97] transition-all duration-150';

const variants: Record<Variant, string> = {
  primary: 'rounded-md bg-brand-600 text-on-primary hover:bg-brand-700',
  accent: 'rounded-md bg-accent-blue text-white hover:brightness-110 shadow-apple-sm',
  secondary:
    'rounded-md bg-canvas text-ink border border-hairline hover:bg-surface-soft hover:border-surface-strong',
  ghost:
    'rounded-md bg-transparent text-muted hover:bg-surface-soft hover:text-ink',
  danger: 'rounded-md bg-danger-600 text-white hover:bg-danger-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-5 text-sm rounded-md',
  lg: 'h-12 px-6 text-base rounded-lg',
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