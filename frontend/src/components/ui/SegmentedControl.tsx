import { cn } from '../../lib/cn';

interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

// Cal.com nav-pill-group: capsule container with surface-soft bg + p-1.5 + rounded-full
// Active segment: bg-canvas text-ink shadow-card
// Inactive segment: text-muted hover:text-ink
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const sizeClasses = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  return (
    <div
      role="group"
      className={cn(
        'inline-flex gap-1 rounded-full bg-surface-soft p-1.5',
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-full font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
              sizeClasses,
              isActive
                ? 'bg-canvas text-ink shadow-card'
                : 'text-muted hover:text-ink'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
