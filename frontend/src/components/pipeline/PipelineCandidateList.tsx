import { Link } from 'react-router-dom';
import { ChevronRight, User } from 'lucide-react';
import type { PipelineBoardCandidate } from '../../types';
import type { StageConfig } from '../../lib/pipelineStages';
import { formatDate } from '../../lib/formatDate';
import { cn } from '../../lib/cn';
import { Spinner } from '../ui';
import { stageAgeClass, stageAgeDays } from '../../lib/pipelineInsights';

interface PipelineCandidateListProps {
  stage: StageConfig;
  candidates: PipelineBoardCandidate[];
  selectedCandidateId: number | null;
  highlightedCandidateId: number | null;
  busyId: number | null;
  onSelect: (candidate: PipelineBoardCandidate) => void;
}

export function PipelineCandidateList({
  stage,
  candidates,
  selectedCandidateId,
  highlightedCandidateId,
  busyId,
  onSelect,
}: PipelineCandidateListProps) {
  return (
    <section className="rounded-md border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">当前阶段候选人</h2>
          <p className="mt-0.5 text-xs text-muted">
            {stage.label} · {candidates.length} 人
          </p>
        </div>
        <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium', stage.badgeBg)}>
          {stage.label}
        </span>
      </div>

      <div className="max-h-[640px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-soft">
            当前阶段暂无候选人
          </div>
        ) : (
          <ul className="divide-y divide-hairline-soft">
            {candidates.map((candidate) => {
              const selected = candidate.candidate_id === selectedCandidateId;
              const highlighted = candidate.candidate_id === highlightedCandidateId;
              const ageDays = stageAgeDays(candidate.updated_at);
              return (
                <li key={candidate.candidate_id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(candidate)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(candidate);
                      }
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
                      selected && 'bg-surface-card',
                      highlighted && 'ring-2 ring-brand-500 ring-inset',
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/candidates/${candidate.candidate_id}`}
                          className="truncate text-sm font-semibold text-ink hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {candidate.name_masked}
                        </Link>
                        {busyId === candidate.candidate_id && <Spinner size="sm" />}
                      </div>
                      <p className={cn('mt-0.5 truncate text-xs', stageAgeClass(candidate.stage, ageDays))}>
                        {candidate.updated_at ? formatDate(candidate.updated_at) : '暂无更新时间'}
                        {ageDays !== null ? ` · 停留 ${ageDays} 天` : ''}
                        {candidate.updated_by_name ? ` · ${candidate.updated_by_name}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-soft" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
