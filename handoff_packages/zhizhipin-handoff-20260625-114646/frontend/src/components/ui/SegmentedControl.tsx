import { useRef, useEffect, useState } from 'react';
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

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    width: number;
    left: number;
  }>({ width: 0, left: 0 });

  const sizeClasses =
    size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';

  // Update indicator position when value changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeIdx = options.findIndex((o) => o.value === value);
    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    const activeBtn = buttons[activeIdx];
    if (activeBtn) {
      const { offsetLeft, offsetWidth } = activeBtn;
      setIndicatorStyle({ width: offsetWidth, left: offsetLeft });
    }
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      role="group"
      className={cn(
        'relative inline-flex gap-1 rounded-full bg-surface-soft p-1.5',
        className,
      )}
    >
      {/* Sliding indicator — Apple style */}
      <div
        className="absolute top-1.5 z-0 rounded-full bg-canvas shadow-apple-sm transition-all duration-300 ease-apple"
        style={{
          height: size === 'sm' ? 'calc(100% - 12px)' : 'calc(100% - 12px)',
          width: `${indicatorStyle.width}px`,
          transform: `translateX(${indicatorStyle.left}px)`,
        }}
      />
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative z-10 rounded-full font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
              sizeClasses,
              isActive ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}