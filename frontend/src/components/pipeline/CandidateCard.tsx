// 看板候选人卡片：展示候选人当前阶段，并提供就地变更状态的下拉控件。
// 这是过去缺失的"给候选人改状态栏"的核心交互入口。

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, User } from 'lucide-react';
import type { PipelineBoardCandidate, PipelineStage } from '../../types';
import { STAGES, STAGE_BY_KEY } from '../../lib/pipelineStages';
import { formatDate } from '../../lib/formatDate';
import { Spinner } from '../ui';
import { FeedbackForm } from '../interview/FeedbackForm';

// 给定当前阶段，推算"推进到下一阶段"的目标（用于一键推进按钮）。
const FORWARD: Partial<Record<PipelineStage, PipelineStage>> = {
  pending: 'ai_screen',
  ai_screen: 'interview_first',
  interview_first: 'interview_second',
  interview_second: 'interview_final',
  interview_final: 'offer',
  offer: 'onboarded',
};

interface CandidateCardProps {
  candidate: PipelineBoardCandidate;
  busy: boolean;
  jobId: number;
  onMove: (candidateId: number, toStage: PipelineStage, note?: string) => void;
}

export function CandidateCard({ candidate, busy, jobId, onMove }: CandidateCardProps) {
  const [picking, setPicking] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const atInterview =
    candidate.stage === 'interview_first' ||
    candidate.stage === 'interview_second' ||
    candidate.stage === 'interview_final';
  const stage = STAGE_BY_KEY[candidate.stage];
  const next = FORWARD[candidate.stage];
  const isTerminal = candidate.stage === 'onboarded' || candidate.stage === 'rejected';

  const move = (toStage: PipelineStage) => {
    const note = window.prompt('变更备注（可留空）') ?? undefined;
    onMove(candidate.candidate_id, toStage, note);
  };

  return (
    <div className="rounded-lg border border-hairline bg-canvas px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/candidates/${candidate.candidate_id}`}
          className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-ink hover:underline"
        >
          <User className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="truncate">{candidate.name_masked}</span>
        </Link>
        {busy && <Spinner size="sm" />}
      </div>

      {candidate.updated_at && (
        <p className="mt-1 text-[11px] text-muted-soft">
          {formatDate(candidate.updated_at)}
          {candidate.updated_by_name ? ` · ${candidate.updated_by_name}` : ''}
        </p>
      )}

      {/* 状态变更操作区 */}
      <div className="mt-2 flex items-center gap-1.5">
        {/* 一键推进到下一阶段 */}
        {next && (
          <button
            type="button"
            disabled={busy}
            onClick={() => move(next)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${stage.badgeBg} transition-opacity hover:opacity-80 disabled:opacity-50`}
          >
            {STAGE_BY_KEY[next].label}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}

        {/* 淘汰（非终态时展示） */}
        {!isTerminal && (
          <button
            type="button"
            disabled={busy}
            onClick={() => move('rejected')}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-danger-600 hover:bg-danger-50 disabled:opacity-50"
          >
            淘汰
          </button>
        )}

        {/* 录入评分：仅在面试阶段展示 */}
        {atInterview && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowFeedback((v) => !v)}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-surface-soft disabled:opacity-50"
          >
            {showFeedback ? '收起' : '录入评分'}
          </button>
        )}

        {/* 更多：跳到任意阶段 */}
        <div className="relative ml-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking((p) => !p)}
            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-soft disabled:opacity-50"
            aria-haspopup="listbox"
            aria-expanded={picking}
          >
            更改…
          </button>
          {picking && (
            <ul
              role="listbox"
              className="absolute right-0 z-10 mt-1 w-28 overflow-hidden rounded-md border border-hairline bg-canvas py-1 shadow-lg"
            >
              {STAGES.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    disabled={s.key === candidate.stage}
                    onClick={() => {
                      setPicking(false);
                      move(s.key);
                    }}
                    className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs hover:bg-surface-soft disabled:cursor-default disabled:opacity-40 ${
                      s.key === candidate.stage ? 'font-semibold text-ink' : 'text-body'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 内联评分表单 */}
      {atInterview && showFeedback && (
        <div className="mt-2">
          <FeedbackForm
            candidateId={candidate.candidate_id}
            jobId={jobId}
            onSubmitted={() => setShowFeedback(false)}
          />
        </div>
      )}
    </div>
  );
}
