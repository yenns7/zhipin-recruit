import { Link } from 'react-router-dom';
import { ChevronRight, User } from 'lucide-react';
import type { PipelineBoardCandidate, PipelineStage } from '../../types';
import { STAGES, type StageConfig } from '../../lib/pipelineStages';
import { formatDate } from '../../lib/formatDate';
import { cn } from '../../lib/cn';
import { Button, Spinner } from '../ui';
import { stageAgeClass, stageAgeDays } from '../../lib/pipelineInsights';

interface PipelineCandidateListProps {
  stage: StageConfig;
  candidates: PipelineBoardCandidate[];
  counts: Partial<Record<PipelineStage, number>>;
  jobId: number | null;
  selectedCandidateId: number | null;
  highlightedCandidateId: number | null;
  busyId: number | null;
  onJumpToStage: (stage: PipelineStage) => void;
  onSelect: (candidate: PipelineBoardCandidate) => void;
}

export function PipelineCandidateList({
  stage,
  candidates,
  counts,
  jobId,
  selectedCandidateId,
  highlightedCandidateId,
  busyId,
  onJumpToStage,
  onSelect,
}: PipelineCandidateListProps) {
  const nextStages = STAGES.filter(
    (item) => item.key !== stage.key && (counts[item.key] ?? 0) > 0,
  ).slice(0, 3);

  return (
    <section className="rounded-md border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            当前阶段候选人 · {candidates.length} 人
          </h2>
          <p className="mt-0.5 text-xs text-muted">按停留时间和负责人优先处理</p>
        </div>
      </div>

      <div className="max-h-[640px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="space-y-4 px-4 py-12 text-center">
            <div>
              <p className="text-sm font-medium text-ink">当前阶段暂无候选人</p>
              <p className="mt-1 text-xs text-muted">
                可以先切到有人的阶段继续处理，或去补充更多候选人。
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {nextStages.map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onJumpToStage(item.key)}
                >
                  去{item.label} {counts[item.key] ?? 0} 人
                </Button>
              ))}
              {jobId !== null && (
                <Link to={`/jobs/${jobId}/match`}>
                  <Button type="button" size="sm" variant="secondary">
                    去匹配更多候选人
                  </Button>
                </Link>
              )}
              <Link to="/upload">
                <Button type="button" size="sm" variant="secondary">
                  上传简历
                </Button>
              </Link>
            </div>
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
