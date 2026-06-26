import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref,
) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-10 w-full rounded-md border border-hairline bg-canvas px-3.5 text-sm text-ink',
          'placeholder:text-muted-soft',
          'transition-all duration-200',
          'focus:border-ink focus:outline-none focus:shadow-apple-focus',
          error && 'border-danger-500 focus:border-danger-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});