import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-shimmer rounded-md bg-surface-soft', className)}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-hairline"
      role="status"
      aria-label="加载中"
    >
      <div className="flex gap-4 border-b border-hairline bg-surface-soft px-4 py-3">
        {Array.from({ length: cols }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-hairline-soft">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn('h-4 flex-1', col === 0 && 'max-w-[40%]')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
