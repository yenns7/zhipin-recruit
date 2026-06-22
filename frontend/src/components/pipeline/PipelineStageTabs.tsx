import type { PipelineStage } from '../../types';
import type { StageConfig } from '../../lib/pipelineStages';
import { cn } from '../../lib/cn';

interface PipelineStageTabsProps {
  stages: StageConfig[];
  activeStage: PipelineStage;
  counts: Partial<Record<PipelineStage, number>>;
  onSelect: (stage: PipelineStage) => void;
}

export function PipelineStageTabs({
  stages,
  activeStage,
  counts,
  onSelect,
}: PipelineStageTabsProps) {
  return (
    <nav aria-label="候选人管道阶段" className="overflow-x-auto rounded-md border border-hairline bg-canvas p-2">
      <div className="flex min-w-max gap-2">
        {stages.map((stage) => {
          const active = stage.key === activeStage;
          const count = counts[stage.key] ?? 0;
          return (
            <button
              key={stage.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(stage.key)}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-on-primary shadow-apple-xs'
                  : 'border-hairline bg-surface-soft text-body hover:border-surface-strong hover:bg-surface-card',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', active ? 'bg-white' : stage.dot)} />
              <span>{stage.label}</span>
              <span
                className={cn(
                  'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-white/15 text-white' : stage.badgeBg,
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
