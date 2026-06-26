import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type CardVariant = 'default' | 'glass' | 'elevated' | 'flat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: CardVariant;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'rounded-lg border border-hairline bg-canvas shadow-card',
  glass: 'glass',
  elevated:
    'rounded-apple border border-hairline bg-canvas shadow-apple-md hover:shadow-apple-lg hover:-translate-y-0.5',
  flat: 'rounded-lg bg-surface-soft',
};

export function Card({
  variant = 'default',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'transition-all duration-300',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('border-b border-hairline-soft px-5 py-4', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: CardProps) {
  return (
    <h3
      className={cn('text-base font-semibold text-ink', className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardBody({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}