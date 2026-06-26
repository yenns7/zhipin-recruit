// Visualises one tool invocation in the agent's reasoning trace: a compact
// card showing the Chinese tool name, its arguments, and a result summary that
// expands to the raw JSON payload.

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toolMeta } from '../../lib/agent';

interface ToolCallCardProps {
  tool: string;
  args: Record<string, unknown>;
  // undefined while the call is in flight; set once the result arrives.
  result?: unknown;
  pending: boolean;
}

// Render args as a compact "key=value" inline list, e.g. job_id=1, limit=5.
function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ');
}

// One-line summary of the result so users see "what came back" before expanding.
function summarise(result: unknown): string {
  if (result === undefined || result === null) return '无数据';
  if (Array.isArray(result)) return `返回 ${result.length} 条记录`;
  if (typeof result === 'object') {
    const keys = Object.keys(result as Record<string, unknown>);
    return `返回数据对象 · ${keys.length} 个字段`;
  }
  return String(result);
}

export function ToolCallCard({ tool, args, result, pending }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(tool);
  const Icon = meta.icon;
  const argText = formatArgs(args);
  const hasResult = !pending && result !== undefined;

  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-surface-soft">
      <button
        type="button"
        onClick={() => hasResult && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left',
          hasResult && 'cursor-pointer hover:bg-surface-card'
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-white">
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-ink">{meta.label}</span>
            {argText && (
              <span className="truncate font-mono text-xs text-muted">{argText}</span>
            )}
          </span>
          <span className="block text-xs text-muted-soft">
            {pending ? '调用中…' : summarise(result)}
          </span>
        </span>
        {hasResult && (
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-soft transition-transform',
              open && 'rotate-90'
            )}
          />
        )}
      </button>
      {open && hasResult && (
        <pre className="max-h-72 overflow-auto border-t border-hairline bg-canvas px-3 py-2.5 font-mono text-xs leading-relaxed text-body">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
