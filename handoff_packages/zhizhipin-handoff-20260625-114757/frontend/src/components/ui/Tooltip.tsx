import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Side = 'top' | 'bottom';

const SIDE_POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
};

export function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: string;
  side?: Side;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[60] whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-card-lg transition-opacity duration-150',
          'group-hover:animate-scale-in group-hover:opacity-100',
          'group-focus-within:animate-scale-in group-focus-within:opacity-100',
          SIDE_POSITION[side],
        )}
      >
        {label}
      </span>
    </span>
  );
}
