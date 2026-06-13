import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

// Default: white canvas + hairline border + rounded-lg (12px) + shadow-card.
// Transition is built in so pages adding hover:shadow-card-hover / hover:-translate-y
// animate smoothly. For a flat feature/stat card, pass
// className="bg-surface-card border-transparent shadow-none".
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-hairline bg-canvas shadow-card transition-all duration-200',
        className
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
