// Collapsible "thinking" trace. Shows the agent's intermediate thoughts with a
// brain icon; auto-expanded while streaming, collapsible once the turn settles.

import { useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ThoughtTraceProps {
  thoughts: string[];
  // True while the turn is still streaming (keeps the trace open + pulsing).
  active: boolean;
}

export function ThoughtTrace({ thoughts, active }: ThoughtTraceProps) {
  const [open, setOpen] = useState(true);
  if (thoughts.length === 0) return null;

  return (
    <div className="rounded-md border border-hairline bg-surface-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-card"
      >
        <Brain
          className={cn('h-4 w-4 text-muted', active && 'animate-pulse text-ink')}
          strokeWidth={2}
        />
        <span className="flex-1 text-xs font-medium text-muted">
          {active ? '思考中…' : `思考过程 · ${thoughts.length} 步`}
        </span>
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-soft transition-transform',
            open && 'rotate-90'
          )}
        />
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-hairline px-3 py-2.5">
          {thoughts.map((t, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
              <span className="select-none text-muted-soft">{i + 1}.</span>
              <span className="whitespace-pre-wrap">{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
