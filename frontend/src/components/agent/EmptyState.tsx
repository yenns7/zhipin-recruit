import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toolMeta, type AgentTool } from '../../lib/agent';

interface EmptyStateProps {
  tools: AgentTool[];
  examples: string[];
  onPick: (text: string) => void;
  disabled: boolean;
}

export function EmptyState({ tools, examples, onPick, disabled }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white">
        <Sparkles className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-display text-ink">你好，我是招聘智能助手</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted">
        我可以查询系统数据、整理参考建议；需要改数据时，会先等你人工确认。
      </p>

      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {examples.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className={cn(
              'rounded-md border border-hairline bg-surface-soft px-4 py-3 text-left text-sm text-body transition-colors',
              'hover:border-surface-strong hover:bg-surface-card disabled:opacity-50',
            )}
          >
            {q}
          </button>
        ))}
      </div>

      {tools.length > 0 && (
        <div className="mt-8 w-full">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-soft">
            我能调用的工具
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {tools.map((t) => {
              const meta = toolMeta(t.name);
              const Icon = meta.icon;
              return (
                <span
                  key={t.name}
                  title={t.description}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-3 py-1 text-xs font-medium text-body"
                >
                  <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
