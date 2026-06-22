import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ToastContext, type ToastApi } from './ToastContext';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const TONE_CONFIG: Record<
  ToastTone,
  { icon: typeof CheckCircle2; iconClass: string }
> = {
  success: { icon: CheckCircle2, iconClass: 'text-success-600' },
  error: { icon: AlertCircle, iconClass: 'text-danger-600' },
  info: { icon: Info, iconClass: 'text-muted' },
};

const DURATION: Record<ToastTone, number> = {
  success: 3000,
  info: 3500,
  error: 5000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-[1000] flex w-full max-w-sm flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const { icon: Icon, iconClass } = TONE_CONFIG[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="animate-slide-up pointer-events-auto flex items-start gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3 shadow-card-lg"
            >
              <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)}
                strokeWidth={2}
                aria-hidden="true"
              />
              <p className="flex-1 text-sm leading-relaxed text-ink">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 -mt-0.5 rounded p-0.5 text-muted-soft transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="关闭通知"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
