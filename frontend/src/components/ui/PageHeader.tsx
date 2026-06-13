import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps {
  title: string;
  // Secondary description line under the title.
  description?: ReactNode;
  // Optional right-aligned actions (buttons, links).
  actions?: ReactNode;
  // Optional content above the title (e.g. breadcrumbs).
  eyebrow?: ReactNode;
  className?: string;
}

// Unified page header: consistent title size/weight, description tone, and a
// right-aligned actions slot. Replaces the per-page ad-hoc header markup so
// every page's top block aligns identically.
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {eyebrow && <div className="mb-2">{eyebrow}</div>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
