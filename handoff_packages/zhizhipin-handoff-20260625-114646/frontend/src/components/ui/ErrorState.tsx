import { cn } from '../../lib/cn';

interface ErrorStateProps {
  // Error message to show; falls back to a generic line.
  message?: string;
  // Optional retry handler; renders a "重试" affordance when provided.
  onRetry?: () => void;
  className?: string;
}

// Unified inline error block: soft danger surface + message + optional retry.
// Replaces the per-page repeated `rounded-lg bg-danger-50 ...` markup.
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700',
        className
      )}
    >
      {message || '加载失败，请稍后重试'}
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-3 font-medium underline underline-offset-2 hover:no-underline focus:outline-none"
        >
          重试
        </button>
      )}
    </div>
  );
}
