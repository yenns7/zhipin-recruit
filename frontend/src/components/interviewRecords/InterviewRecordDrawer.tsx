import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/formatDate';
import {
  recordSummary,
  resultLabel,
  resultTone,
  roundLabel,
} from '../../lib/interviewRecords';
import { stageLabel } from '../../lib/pipelineStages';
import { useAsync } from '../../lib/useAsync';
import type { InterviewListItem, PipelineStage } from '../../types';
import { Badge, Button, Spinner } from '../ui';

interface InterviewRecordDrawerProps {
  item: InterviewListItem;
  onClose: () => void;
}

export function InterviewRecordDrawer({ item, onClose }: InterviewRecordDrawerProps) {
  const journeyAsync = useAsync(
    () => api.getCandidateJourney(item.candidate_id, item.job_id),
    [item.candidate_id, item.job_id],
  );
  const journey = journeyAsync.data;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭详情"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-hairline bg-canvas shadow-apple-lg">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              {item.type === 'ai' ? 'AI 预筛报告' : `${roundLabel(item.round)}反馈`}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-ink">
              {item.name_masked ?? `候选人 #${item.candidate_id}`}
            </h2>
            <p className="mt-1 truncate text-sm text-muted">
              {item.job_title ?? `岗位 #${item.job_id}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted hover:bg-surface-soft hover:text-ink"
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-lg border border-hairline bg-surface-soft px-4 py-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">结果</p>
                <div className="mt-1">
                  <Badge tone={resultTone(item.pass)}>{resultLabel(item.pass)}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted">评分</p>
                <p className="mt-1 font-semibold tabular-nums text-ink">{item.score ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">面试官</p>
                <p className="mt-1 font-medium text-ink">
                  {item.interviewer_name ?? (item.type === 'ai' ? 'AI' : '—')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">提交时间</p>
                <p className="mt-1 text-ink">
                  {item.created_at ? formatDate(item.created_at) : '—'}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-body">{recordSummary(item)}</p>
          </section>

          {item.type === 'feedback' && (
            <section className="mt-5 space-y-3">
              <h3 className="text-sm font-semibold text-ink">面试反馈</h3>
              {item.evaluation && Object.keys(item.evaluation).length > 0 && (
                <div className="rounded-md border border-hairline bg-canvas px-3 py-2">
                  <p className="text-xs font-medium text-muted">评价维度</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(item.evaluation).map(([dimension, value]) => (
                      <Badge key={dimension} tone="neutral">
                        {dimension} {value}/5
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <DetailBlock title="优势" body={item.strengths} empty="暂未填写优势" />
              <DetailBlock title="顾虑" body={item.concerns} empty="暂未填写顾虑" />
              <DetailBlock title="备注" body={item.note} empty="暂未填写备注" />
            </section>
          )}

          {item.type === 'ai' && (
            <section className="mt-5 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
              <p className="text-sm font-semibold text-ink">AI 预筛报告</p>
              <p className="mt-1 text-sm text-muted">
                这里展示的是 AI 预筛摘要，完整问答与评估报告可进入报告页查看。
              </p>
              <Link to={`/interviews/${item.id}`} className="mt-3 inline-flex">
                <Button variant="secondary" size="sm">
                  查看完整报告
                </Button>
              </Link>
            </section>
          )}

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-ink">流程时间线</h3>
            {journeyAsync.loading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <Spinner size="sm" />
                加载时间线…
              </div>
            )}
            {!journeyAsync.loading && journeyAsync.error && (
              <p className="mt-3 text-sm text-danger-600">{journeyAsync.error.message}</p>
            )}
            {!journeyAsync.loading && journey && (
              <div className="mt-3 space-y-3">
                {journey.timeline.length === 0 ? (
                  <p className="text-sm text-muted">暂无流程记录</p>
                ) : (
                  journey.timeline.map((step, index) => (
                    <div key={`${step.stage}-${step.ts}-${index}`} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {stageLabel(step.stage as PipelineStage)}
                        </p>
                        <p className="text-xs text-muted">
                          {step.ts ? formatDate(step.ts) : '—'}
                          {step.updated_by_name ? ` · ${step.updated_by_name}` : ''}
                        </p>
                        {step.note && <p className="mt-1 text-sm text-body">{step.note}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {journey && journey.feedback.length > 0 && (
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-ink">同岗位历史反馈</h3>
              <div className="mt-3 space-y-2">
                {journey.feedback.map((feedback) => (
                  <div
                    key={feedback.id}
                    className="rounded-md border border-hairline bg-canvas px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {roundLabel(feedback.round)}
                      </span>
                      <Badge tone={resultTone(feedback.passed)}>
                        {resultLabel(feedback.passed)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {feedback.interviewer_name ?? '—'} · {feedback.score ?? '—'} 分
                    </p>
                    {(feedback.concerns || feedback.note || feedback.strengths) && (
                      <p className="mt-1 text-sm text-body">
                        {feedback.concerns || feedback.note || feedback.strengths}
                      </p>
                    )}
                    {Object.keys(feedback.evaluation).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(feedback.evaluation).map(([dimension, value]) => (
                          <Badge key={dimension} tone="neutral">
                            {dimension} {value}/5
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailBlock({
  title,
  body,
  empty,
}: {
  title: string;
  body: string | null;
  empty: string;
}) {
  return (
    <div className="rounded-md border border-hairline bg-canvas px-3 py-2">
      <p className="text-xs font-medium text-muted">{title}</p>
      <p className="mt-1 text-sm text-body">{body || empty}</p>
    </div>
  );
}
