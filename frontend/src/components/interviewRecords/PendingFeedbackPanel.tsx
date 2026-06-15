import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import { roundLabel, type PendingFeedbackItem } from '../../lib/interviewRecords';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '../ui';

interface PendingFeedbackPanelProps {
  items: PendingFeedbackItem[];
  activeKey?: string | null;
  onStartFeedback?: (item: PendingFeedbackItem) => void;
}

export function PendingFeedbackPanel({
  items,
  activeKey,
  onStartFeedback,
}: PendingFeedbackPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>待填写反馈</CardTitle>
          <span className="text-xs text-muted-soft">
            候选人在面试阶段，但本轮还没有反馈记录
          </span>
        </div>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="暂无待填写反馈"
            description="当前面试阶段候选人均已有本轮反馈"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((item) => {
              const key = `${item.job_id}-${item.candidate_id}-${item.round}`;
              const active = activeKey === key;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{item.name_masked}</p>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-warning-700">
                          {roundLabel(item.round)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{item.job_title}</p>
                      <p className="mt-2 text-xs text-muted-soft">
                        进入本轮：{item.updated_at ? formatDate(item.updated_at) : '—'}
                        {item.updated_by_name ? ` · ${item.updated_by_name}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {onStartFeedback && (
                        <button
                          type="button"
                          onClick={() => onStartFeedback(item)}
                          className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-xs font-semibold text-on-primary hover:opacity-90"
                        >
                          {active ? '正在填写' : '填写反馈'}
                        </button>
                      )}
                      <Link
                        to={`/pipeline?job=${item.job_id}&candidate=${item.candidate_id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-canvas px-3 text-xs font-semibold text-ink shadow-sm hover:bg-surface-soft"
                      >
                        去流程
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
