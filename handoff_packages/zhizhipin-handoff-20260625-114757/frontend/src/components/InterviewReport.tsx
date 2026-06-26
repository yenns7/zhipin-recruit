// 共享面试报告渲染组件 — 用于 InterviewsPage（提交后报告）和 InterviewReportPage（历史报告详情）。

import type { InterviewReport as InterviewReportType, InterviewReportDetail } from '../types';
import { formatDate } from '../lib/formatDate';
import { Card, CardBody, CardHeader, CardTitle } from './ui';
import { Reveal, AnimatedNumber } from './motion';

// Per-question score badge — plain span to avoid Badge class collision
function ScoreChip({ score }: { score: number }) {
  const colorClass =
    score >= 4
      ? 'bg-success-50 text-success-700'
      : score >= 2.5
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium tabular-nums ${colorClass}`}
    >
      <AnimatedNumber value={score} decimals={1} suffix=" / 5" />
    </span>
  );
}

// Overall pass/fail badge — plain span to avoid Badge class collision
function PassBadge({ pass }: { pass: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-4 py-1 text-sm font-semibold ${
        pass
          ? 'bg-success-50 text-success-700'
          : 'bg-danger-50 text-danger-700'
      }`}
    >
      {pass ? '建议通过' : '不建议通过'}
    </span>
  );
}

function DetailRow({
  index,
  item,
  question,
}: {
  index: number;
  item: InterviewReportDetail;
  question?: string;
}) {
  return (
    <div className="border-b border-hairline-soft py-4 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-soft">
          第 {index + 1} 题
        </span>
        <ScoreChip score={item.score ?? 0} />
      </div>

      {question && (
        <p className="mb-3 text-sm font-medium text-ink">{question}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Highlight */}
        <div className="rounded-lg bg-success-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success-600">
            亮点
          </p>
          <p className="text-sm text-body">{item.highlight || '—'}</p>
        </div>

        {/* Concern */}
        <div className="rounded-lg bg-warning-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning-600">
            疑点 / 包装迹象
          </p>
          <p className="text-sm text-body">{item.concern || '—'}</p>
        </div>
      </div>

      {/* Per-question recommendation */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs text-muted">本题建议：</span>
        <span
          className={`text-xs font-medium ${item.pass_recommended ? 'text-success-600' : 'text-danger-600'}`}
        >
          {item.pass_recommended ? '通过' : '不通过'}
        </span>
      </div>
    </div>
  );
}

interface InterviewReportProps {
  report: InterviewReportType;
  // Optional: if we have the questions, show them alongside each detail row
  questions?: string[];
  // Optional: display interview metadata (from InterviewRecord)
  meta?: {
    interviewId: number;
    candidateId: number;
    jobId: number;
    createdAt: string;
  };
}

export function InterviewReport({ report, questions, meta }: InterviewReportProps) {
  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle>评估总结</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Avg score */}
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums text-ink">
                <AnimatedNumber value={report.avg_score ?? 0} decimals={1} />
              </span>
              <span className="text-sm text-muted">/ 5 综合评分</span>
            </div>

            {/* Overall recommendation */}
            <PassBadge pass={report.pass_recommended ?? false} />
          </div>

          {/* Optional meta info */}
          {meta && (
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline-soft pt-4 text-xs text-muted">
              <div className="flex gap-1">
                <dt className="font-medium text-body">面试 ID：</dt>
                <dd>{meta.interviewId}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="font-medium text-body">候选人 ID：</dt>
                <dd>{meta.candidateId}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="font-medium text-body">岗位 ID：</dt>
                <dd>{meta.jobId}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="font-medium text-body">评估时间：</dt>
                <dd>{formatDate(meta.createdAt)}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      {/* Per-question details */}
      {report.details && report.details.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>逐题评估</CardTitle>
              <span className="text-xs text-muted-soft">
                共 {report.details.length} 题
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <Reveal stagger={0.07}>
              {report.details.map((item, i) => (
                <DetailRow
                  key={i}
                  index={i}
                  item={item}
                  question={questions?.[i]}
                />
              ))}
            </Reveal>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
