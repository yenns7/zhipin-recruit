import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
}

export function Composer({ value, onChange, onSend, onStop, streaming }: ComposerProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) onSend();
    }
  }

  const canSend = value.trim().length > 0 && !streaming;

  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 rounded-lg border border-hairline bg-canvas p-2 shadow-card focus-within:border-ink">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={streaming}
          placeholder={streaming ? '智能体回答中…' : '输入问题，Enter 发送 · Shift+Enter 换行'}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none disabled:opacity-60"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            title="停止"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-on-primary transition-colors hover:bg-brand-700 disabled:opacity-40"
            title="发送"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-center text-xs text-muted-soft">
        AI 只作参考，关键操作请人工确认。
      </p>
    </div>
  );
}
