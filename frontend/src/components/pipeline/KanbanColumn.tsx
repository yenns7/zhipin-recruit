// 看板单列：一个阶段的标题、当前人数，以及该阶段下的候选人卡片。
import type { PipelineBoardCandidate, PipelineStage } from '../../types';
import type { StageConfig } from '../../lib/pipelineStages';
import { CandidateCard } from './CandidateCard';

interface KanbanColumnProps {
  stage: StageConfig;
  candidates: PipelineBoardCandidate[];
  busyId: number | null;
  onMove: (candidateId: number, toStage: PipelineStage, note?: string) => void;
}

export function KanbanColumn({ stage, candidates, busyId, onMove }: KanbanColumnProps) {
  return (
    <div
      className={`flex min-h-[200px] flex-col rounded-xl border ${stage.border} ${stage.bg} px-3 py-3`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${stage.text}`}>
          <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
          {stage.label}
        </span>
        <span
          className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${stage.badgeBg}`}
        >
          {candidates.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {candidates.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <span className="text-xs text-muted-soft">暂无候选人</span>
          </div>
        ) : (
          candidates.map((c) => (
            <CandidateCard
              key={c.candidate_id}
              candidate={c}
              busy={busyId === c.candidate_id}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </div>
  );
}
