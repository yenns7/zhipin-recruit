import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Lightbulb, MoreHorizontal, User } from 'lucide-react';
import type {
  CandidateDispositionInput,
  JobListItem,
  PipelineBoardCandidate,
  PipelineStage,
} from '../../types';
import { STAGES, STAGE_BY_KEY, stageLabel } from '../../lib/pipelineStages';
import {
  buildPipelineInsight,
  isInterviewStage,
  isTerminalStage,
  NEXT_STAGE,
  stageAgeLabel,
} from '../../lib/pipelineInsights';
import { Button, Card, CardBody, CardHeader, CardTitle, Spinner } from '../ui';
import { RejectionDispositionForm } from './RejectionDispositionForm';
import { OfferDrawer } from './OfferDrawer';
import { cn } from '../../lib/cn';

interface PipelineCandidatePanelProps {
  candidate: PipelineBoardCandidate | null;
  jobId: number;
  transferTargets: JobListItem[];
  busy: boolean;
  onMove: (
    candidateId: number,
    toStage: PipelineStage,
    note?: string,
    disposition?: CandidateDispositionInput,
  ) => void | Promise<void>;
  onTransfer: (candidateId: number, toJobId: number, reason: string) => void | Promise<void>;
}

function insightToneClass(tone: 'neutral' | 'warning' | 'success') {
  if (tone === 'warning') return 'border-warning-200 bg-warning-50 text-warning-700';
  if (tone === 'success') return 'border-success-200 bg-success-50 text-success-700';
  return 'border-hairline bg-surface-soft text-body';
}

export function PipelineCandidatePanel({
  candidate,
  jobId,
  transferTargets,
  busy,
  onMove,
  onTransfer,
}: PipelineCandidatePanelProps) {
  const [showDisposition, setShowDisposition] = useState(false);
  const [showOffer, setShowOffer] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [targetStage, setTargetStage] = useState<PipelineStage | ''>('');
  const [moveNote, setMoveNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const candidateId = candidate?.candidate_id ?? null;
  const candidateStage = candidate?.stage ?? null;

  useEffect(() => {
    setShowDisposition(false);
    setShowOffer(false);
    setShowCorrection(false);
    setMoveNote('');
    setTransferTargetId('');
    setTransferReason('');
    setTransferError(null);
    setTargetStage('');
    setCorrectionReason('');
    setCorrectionError(null);
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

  async function correctStage() {
    if (!targetStage) return;
    const reason = correctionReason.trim();
    if (!reason) {
      setCorrectionError('请填写修正原因');
      return;
    }
    const message = '修正会影响当前阶段和 BI 当前存量，历史记录会保留。确认继续？';
    if (!window.confirm(message)) return;
    setCorrectionError(null);
    await onMove(currentCandidate.candidate_id, targetStage, `阶段修正：${reason}`);
    setTargetStage('');
    setCorrectionReason('');
  }

  async function transferDemand() {
    const targetId = Number(transferTargetId);
    const reason = transferReason.trim();
    if (!targetId) {
      setTransferError('请选择目标招聘需求');
      return;
    }
    if (!reason) {
      setTransferError('请填写转入原因');
      return;
    }
    const target = transferTargets.find((item) => item.id === targetId);
    const message = `确认把 ${currentCandidate.name_masked} 转入「${target?.title ?? '目标需求'}」？当前需求历史会保留。`;
    if (!window.confirm(message)) return;
    setTransferError(null);
    await onTransfer(currentCandidate.candidate_id, targetId, reason);
    setTransferTargetId('');
    setTransferReason('');
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
          <div className="mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">下一步动作</h3>
            <p className="mt-1 text-xs text-muted-soft">
              主流程状态只记录阶段推进，面试反馈在面试任务页处理。
            </p>
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
                填写面试反馈
              </Link>
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

        <section className="border-t border-hairline-soft pt-3">
          <div className="mb-3 rounded-md border border-hairline bg-surface-soft px-3 py-3">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">转入其他招聘需求</p>
                <p className="mt-1 text-xs text-muted">
                  适合候选人更匹配其他需求的场景；保留当前需求历史，并要求记录转入原因。
                </p>
              </div>
              {transferTargets.length > 0 ? (
                <>
                  <label htmlFor="pipeline-transfer-target" className="text-xs font-semibold text-muted">
                    目标招聘需求
                  </label>
                  <select
                    id="pipeline-transfer-target"
                    value={transferTargetId}
                    onChange={(event) => {
                      setTransferTargetId(event.target.value);
                      setTransferError(null);
                    }}
                    disabled={busy}
                    className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-60"
                  >
                    <option value="">选择目标需求</option>
                    {transferTargets.map((job) => (
                      <option key={job.id} value={job.id}>
                        {[job.job_code || `JOB-${job.id}`, job.title, job.department]
                          .filter(Boolean)
                          .join(' · ')}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="pipeline-transfer-reason" className="text-xs font-semibold text-muted">
                    转入原因
                  </label>
                  <textarea
                    id="pipeline-transfer-reason"
                    rows={2}
                    maxLength={240}
                    value={transferReason}
                    onChange={(event) => {
                      setTransferReason(event.target.value);
                      setTransferError(null);
                    }}
                    disabled={busy}
                    className="w-full resize-none rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:opacity-60"
                    placeholder="例如：候选人更适合渠道方向，转入渠道经理需求"
                  />
                  {transferError && <p className="text-xs text-danger-700">{transferError}</p>}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={transferDemand}
                    disabled={busy}
                  >
                    确认转入
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-soft">
                  暂无其他可转入的招聘需求，请先创建或恢复目标需求。
                </p>
              )}
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-start px-0 text-muted hover:bg-transparent hover:text-ink"
            onClick={() => setShowCorrection((value) => !value)}
            aria-expanded={showCorrection}
          >
            <MoreHorizontal className="h-4 w-4" />
            更多操作：修正阶段
          </Button>

          {showCorrection && (
            <div className="mt-3 rounded-md border border-warning-200 bg-warning-50 px-3 py-3">
              <div className="mb-2">
                <label htmlFor="pipeline-target-stage" className="text-xs font-semibold text-warning-700">
                  修正阶段
                </label>
                <p className="mt-1 text-xs text-warning-700">
                  用于误推进、误淘汰等补救。修正会影响当前阶段和 BI 当前存量，历史记录会保留。
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  id="pipeline-target-stage"
                  value={targetStage}
                  onChange={(event) => {
                    setTargetStage(event.target.value as PipelineStage);
                    setCorrectionError(null);
                  }}
                  className="h-9 flex-1 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                >
                  <option value="">选择阶段</option>
                  {STAGES.map((item) => (
                    <option key={item.key} value={item.key} disabled={item.key === candidate.stage}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <label htmlFor="pipeline-correction-reason" className="mb-1 mt-2 block text-xs font-semibold text-warning-700">
                修正原因（必填）
              </label>
              <input
                id="pipeline-correction-reason"
                value={correctionReason}
                onChange={(event) => {
                  setCorrectionReason(event.target.value);
                  setCorrectionError(null);
                }}
                placeholder="例如：刚才误点，改回待筛选"
                className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              />
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                disabled={!targetStage || busy}
                onClick={() => void correctStage()}
              >
                保存修正
              </Button>
              {correctionError && <p className="mt-2 text-xs text-danger-600">{correctionError}</p>}
            </div>
          )}
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

        {candidate.stage === 'offer' && showOffer && (
          <OfferDrawer candidateId={candidate.candidate_id} jobId={jobId} />
        )}
      </CardBody>
    </Card>
  );
}
