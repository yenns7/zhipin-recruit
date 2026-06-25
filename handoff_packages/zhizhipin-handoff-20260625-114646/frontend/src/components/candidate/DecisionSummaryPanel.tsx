import { CheckCircle2 } from 'lucide-react';
import { stageLabel } from '../../lib/pipelineStages';
import type { DecisionSummary } from '../../types';
import { Badge } from '../ui';

interface DecisionSummaryPanelProps {
  summary: DecisionSummary;
}

export function DecisionSummaryPanel({ summary }: DecisionSummaryPanelProps) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">主管决策汇总</p>
          <p className="mt-1 text-xs text-muted-soft">
            {summary.current_stage ? stageLabel(summary.current_stage) : '暂无阶段'} · {summary.feedback_count} 条面试反馈
          </p>
        </div>
        <Badge tone={summary.failed_count > 0 ? 'warning' : 'success'}>{summary.recommendation}</Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-md bg-canvas px-3 py-2">
          <p className="text-xs text-muted-soft">平均评分</p>
          <p className="mt-1 font-semibold text-ink">
            {summary.average_score === null ? '—' : `${summary.average_score}/5`}
          </p>
        </div>
        <div className="rounded-md bg-canvas px-3 py-2">
          <p className="text-xs text-muted-soft">通过反馈</p>
          <p className="mt-1 font-semibold text-success-700">{summary.passed_count}</p>
        </div>
        <div className="rounded-md bg-canvas px-3 py-2">
          <p className="text-xs text-muted-soft">风险反馈</p>
          <p className="mt-1 font-semibold text-warning-700">{summary.failed_count + summary.risks.length}</p>
        </div>
      </div>

      {(summary.highlights.length > 0 || summary.risks.length > 0) && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {summary.highlights.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">优势</p>
              <div className="space-y-1">
                {summary.highlights.map((item) => (
                  <p key={item} className="flex items-start gap-2 text-sm text-body">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-700" aria-hidden="true" />
                    <span>{item}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {summary.risks.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">风险点</p>
              <div className="flex flex-wrap gap-2">
                {summary.risks.map((item) => (
                  <Badge key={item} tone="warning">{item}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
