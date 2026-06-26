import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate } from '../../lib/formatDate';
import { Spinner, Badge } from '../ui';
import { stageLabel } from '../../lib/pipelineStages';
import type { CandidateJourney, InterviewRound } from '../../types';
import { DecisionSummaryPanel } from './DecisionSummaryPanel';
import { InterviewGuidePanel } from '../interview/InterviewGuidePanel';
import { roundLabel } from '../../lib/interviewRecords';

function correctionText(note?: string | null) {
  const text = String(note || '');
  return text.startsWith('阶段修正：') ? text.replace(/^阶段修正：/, '') : null;
}

function JourneyDetail({ candidateId, jobId }: { candidateId: number; jobId: number }) {
  const { data, loading, error } = useAsync<CandidateJourney | null>(
    () => api.getCandidateJourney(candidateId, jobId),
    [candidateId, jobId],
  );
  if (loading) return <div className="py-3"><Spinner size="sm" /></div>;
  if (error) return <p className="py-2 text-sm text-danger-600">{error.message}</p>;
  if (!data) return null;
  const hasInterviewStage = data.timeline.some((step) => step.stage === 'interview');
  const latestFeedbackRound = data.feedback.find((item) => item.round)?.round as InterviewRound | undefined;
  const guideRound = latestFeedbackRound ?? 'round_1';
  const showGuide = Boolean(hasInterviewStage || data.feedback.length > 0);

  return (
    <div className="space-y-4 border-t border-hairline pt-3">
      <DecisionSummaryPanel summary={data.decision_summary} />
      {showGuide && (
        <InterviewGuidePanel candidateId={candidateId} jobId={jobId} round={guideRound} />
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">阶段时间线</p>
        <ol className="space-y-1.5">
          {data.timeline.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
              <div>
                <span className="font-medium text-ink">{stageLabel(t.stage)}</span>
                {correctionText(t.note) && (
                  <Badge tone="warning">阶段修正</Badge>
                )}
                {t.updated_by_name && <span className="text-muted"> · {t.updated_by_name}</span>}
                {t.ts && <span className="text-muted-soft"> · {formatDate(t.ts)}</span>}
                {t.note && (
                  <p className="text-xs text-muted">
                    {correctionText(t.note) ?? t.note}
                  </p>
                )}
              </div>
            </li>
          ))}
          {data.timeline.length === 0 && <li className="text-sm text-muted-soft">暂无流转记录</li>}
        </ol>
      </div>
      {data.ai_interviews.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">AI 预筛记录</p>
          {data.ai_interviews.map((iv) => (
            <p key={iv.id} className="text-sm text-body">
              均分 {iv.score ?? '—'} · {iv.pass ? '参考通过' : '参考不通过'}
              {iv.created_at && <span className="text-muted-soft"> · {formatDate(iv.created_at)}</span>}
            </p>
          ))}
        </div>
      )}
      {data.feedback.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">面试官评分</p>
          <div className="space-y-2">
            {data.feedback.map((f) => (
              <div key={f.id} className="rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">
                    {f.round ? roundLabel(f.round) : '面试'}
                  </span>
                  <Badge tone={f.passed ? 'success' : 'danger'}>{f.passed ? '通过' : '不通过'}</Badge>
                  <span className="text-muted">{f.score ?? '—'}/5</span>
                  {f.interviewer_name && <span className="text-muted-soft">· {f.interviewer_name}</span>}
                </div>
                {f.strengths && <p className="mt-1 text-xs text-body">优势：{f.strengths}</p>}
                {f.concerns && <p className="text-xs text-body">顾虑：{f.concerns}</p>}
                {Object.keys(f.evaluation).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(f.evaluation).map(([dimension, value]) => (
                      <Badge key={dimension} tone="neutral">
                        {dimension} {value}/5
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.dispositions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">淘汰沉淀</p>
          <div className="space-y-2">
            {data.dispositions.map((d) => (
              <div key={d.id} className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{d.reason || '未填写原因'}</span>
                  <Badge tone={d.enter_talent_pool ? 'success' : 'neutral'}>
                    {d.enter_talent_pool ? '进入人才池' : '不入人才池'}
                  </Badge>
                </div>
                {d.next_contact_at && (
                  <p className="mt-1 text-xs text-muted">未来可联系：{formatDate(d.next_contact_at)}</p>
                )}
                {d.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.tags.map((tag) => (
                      <Badge key={tag} tone="neutral">{tag}</Badge>
                    ))}
                  </div>
                )}
                {d.note && <p className="mt-1 text-xs text-body">{d.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PipelineProgress({ candidateId }: { candidateId: number }) {
  const { data, loading, error } = useAsync(
    () => api.getCandidatePipelines(candidateId),
    [candidateId],
  );
  const [openJob, setOpenJob] = useState<number | null>(null);

  if (loading) return <div className="py-4"><Spinner size="sm" /></div>;
  if (error) return <p className="text-sm text-danger-600">{error.message}</p>;

  const pipelines = data?.pipelines ?? [];
  if (pipelines.length === 0) {
    return <p className="text-sm text-muted-soft">该候选人尚未进入任何招聘需求流程。</p>;
  }

  return (
    <ul className="space-y-2">
      {pipelines.map((p) => (
        <li key={p.job_id} className="rounded-lg border border-hairline px-4 py-3">
          <button
            type="button"
            onClick={() => setOpenJob(openJob === p.job_id ? null : p.job_id)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="font-medium text-ink">{p.job_title}</span>
            <span className="flex items-center gap-2">
              <Badge tone="brand">{stageLabel(p.stage)}</Badge>
              <span className="text-xs text-muted-soft">{openJob === p.job_id ? '收起' : '展开'}</span>
            </span>
          </button>
          {openJob === p.job_id && (
            <div className="mt-3">
              <JourneyDetail candidateId={candidateId} jobId={p.job_id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
