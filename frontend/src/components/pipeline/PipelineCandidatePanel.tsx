import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb, User } from 'lucide-react';
import type { CandidateDispositionInput, PipelineBoardCandidate, PipelineStage } from '../../types';
import { STAGES, STAGE_BY_KEY, stageLabel } from '../../lib/pipelineStages';
import {
  buildPipelineInsight,
  isInterviewStage,
  isTerminalStage,
  NEXT_STAGE,
  stageAgeLabel,
} from '../../lib/pipelineInsights';
import { Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '../ui';
import { FeedbackForm } from '../interview/FeedbackForm';
import { RejectionDispositionForm } from './RejectionDispositionForm';
import { OfferDrawer } from './OfferDrawer';
import { cn } from '../../lib/cn';

interface PipelineCandidatePanelProps {
  candidate: PipelineBoardCandidate | null;
  jobId: number;
  busy: boolean;
  onMove: (
    candidateId: number,
    toStage: PipelineStage,
    note?: string,
    disposition?: CandidateDispositionInput,
  ) => void | Promise<void>;
}

function insightToneClass(tone: 'neutral' | 'warning' | 'success') {
  if (tone === 'warning') return 'border-warning-200 bg-warning-50 text-warning-700';
  if (tone === 'success') return 'border-success-200 bg-success-50 text-success-700';
  return 'border-hairline bg-surface-soft text-body';
}

export function PipelineCandidatePanel({
  candidate,
  jobId,
  busy,
  onMove,
}: PipelineCandidatePanelProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [targetStage, setTargetStage] = useState<PipelineStage | ''>('');
  const [moveNote, setMoveNote] = useState('');
  const candidateId = candidate?.candidate_id ?? null;
  const candidateStage = candidate?.stage ?? null;

  useEffect(() => {
    setShowFeedback(false);
    setShowDisposition(false);
    setShowOffer(false);
    setMoveNote('');
    setTargetStage(candidateStage ? NEXT_STAGE[candidateStage] ?? '' : '');
  }, [candidateId, candidateStage]);

  const insight = buildPipelineInsight(candidate);

  if (!candidate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>候选人详情</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className={cn('rounded-md border px-4 py-3 text-sm', insightToneClass(insight.tone))}>
            <div className="flex items-center gap-2 font-semibold">
              <Lightbulb className="h-4 w-4" />
              AI 建议
            </div>
            <p className="mt-1 text-xs">{insight.detail}</p>
          </div>
          <p className="text-sm text-muted">从左侧当前阶段候选人列表中选择一个人查看详情。</p>
        </CardBody>
      </Card>
    );
  }

  const stage = STAGE_BY_KEY[candidate.stage];
  const next = NEXT_STAGE[candidate.stage];
  const terminal = isTerminalStage(candidate.stage);
  const currentCandidate = candidate;

  async function move(toStage: PipelineStage) {
    const note = moveNote.trim() || undefined;
    await onMove(currentCandidate.candidate_id, toStage, note);
    setMoveNote('');
  }

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>候选人详情</CardTitle>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft text-muted">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <Link
                  to={`/candidates/${candidate.candidate_id}`}
                  className="truncate text-sm font-semibold text-ink hover:underline"
                >
                  {candidate.name_masked}
                </Link>
                <p className="mt-0.5 text-xs text-muted-soft">
                  {stage.label} · {stageAgeLabel(candidate.updated_at)}
                </p>
              </div>
            </div>
          </div>
          {busy && <Spinner size="sm" />}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className={cn('rounded-md border px-4 py-3 text-sm', insightToneClass(insight.tone))}>
          <div className="flex items-center gap-2 font-semibold">
            <Lightbulb className="h-4 w-4" />
            AI 建议
          </div>
          <p className="mt-1 font-medium">{insight.title}</p>
          <p className="mt-1 text-xs">{insight.detail}</p>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">下一步动作</h3>
            <span className="rounded-md bg-surface-soft px-2 py-1 text-xs text-muted">主流程状态</span>
          </div>
          <label htmlFor="pipeline-move-note" className="mb-1 block text-xs font-semibold text-muted">
            变更备注（可选）
          </label>
          <textarea
            id="pipeline-move-note"
            rows={2}
            maxLength={240}
            value={moveNote}
            onChange={(event) => setMoveNote(event.target.value)}
            disabled={busy}
            className="mb-3 w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-60"
            placeholder="例如：业务反馈通过，安排面试"
          />
          <div className="flex flex-wrap gap-2">
            {next && (
              <Button size="sm" onClick={() => move(next)} disabled={busy}>
                推进到 {stageLabel(next)}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {isInterviewStage(candidate.stage) && (
              <Link
                to={`/interviews?job=${jobId}&candidate=${candidate.candidate_id}`}
                className="inline-flex h-8 items-center justify-center rounded-md border border-hairline bg-canvas px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft"
              >
                去面试工作台
              </Link>
            )}
            {isInterviewStage(candidate.stage) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowFeedback((value) => !value)}
                disabled={busy}
              >
                {showFeedback ? '收起反馈' : '录入评分'}
              </Button>
            )}
            {candidate.stage === 'offer' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowOffer((value) => !value)}
                disabled={busy}
              >
                记录 Offer
              </Button>
            )}
            {!terminal && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setShowDisposition((value) => !value)}
                disabled={busy}
              >
                {showDisposition ? '收起淘汰' : '淘汰'}
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-md border border-hairline bg-surface-soft px-3 py-3">
          <label htmlFor="pipeline-target-stage" className="text-xs font-semibold text-muted">
            跳转到其他阶段
          </label>
          <div className="mt-2 flex gap-2">
            <select
              id="pipeline-target-stage"
              value={targetStage}
              onChange={(event) => setTargetStage(event.target.value as PipelineStage)}
              className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              <option value="">选择阶段</option>
              {STAGES.map((item) => (
                <option key={item.key} value={item.key} disabled={item.key === candidate.stage}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!targetStage || busy}
              onClick={() => {
                if (targetStage) void move(targetStage);
              }}
            >
              更新
            </Button>
          </div>
        </section>

        {showDisposition && (
          <RejectionDispositionForm
            busy={busy}
            onCancel={() => setShowDisposition(false)}
            onSubmit={async (disposition, note) => {
              await onMove(candidate.candidate_id, 'rejected', note, disposition);
              setShowDisposition(false);
            }}
          />
        )}

        {showFeedback && isInterviewStage(candidate.stage) && (
            <FeedbackForm
              candidateId={candidate.candidate_id}
              jobId={jobId}
              initialRound="round_1"
              onMove={(toStage, note) => onMove(candidate.candidate_id, toStage, note)}
              onSubmitted={() => setShowFeedback(false)}
            />
        )}

        {candidate.stage === 'offer' && showOffer && (
          <OfferDrawer candidateId={candidate.candidate_id} jobId={jobId} />
        )}
      </CardBody>
    </Card>
  );
}
