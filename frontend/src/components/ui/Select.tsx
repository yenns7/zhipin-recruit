import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

// Shared native select, matching the Input primitive's height, border, and
// neutral (non-blue) focus ring. Replaces the repeated inline <select>
// className strings across forms (interview/pipeline/jobs/login).
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...props },
  ref
) {
  const selectId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink',
          'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink',
          error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});
