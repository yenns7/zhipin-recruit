import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  // Optional icon drawn in a soft circle above the title.
  icon?: LucideIcon;
  title: string;
  // Secondary guidance line; supports inline links via ReactNode.
  description?: ReactNode;
  // Optional call-to-action (e.g. a Button or Link).
  action?: ReactNode;
  className?: string;
}

// Unified empty-state block: centered icon + title + guidance + optional CTA.
// Replaces the per-page inline SVG/empty markup so every list/result page
// renders empties identically.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-soft text-muted-soft">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
