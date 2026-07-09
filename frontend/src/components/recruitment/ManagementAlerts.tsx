import { AlertTriangle, ArrowRight, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BiManagerAlert } from '../../types';
import { Badge, Card } from '../ui';

function alertKindLabel(kind: string): string {
  if (kind === 'stale_pipeline') return '流程卡住';
  if (kind === 'pending_interview_feedback') return '反馈待补';
  if (kind === 'business_feedback_overdue') return '业务反馈超时';
  return '待处理';
}

function alertTone(priority: string): 'danger' | 'warning' | 'neutral' {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}

export function ManagementAlerts({ alerts }: { alerts: BiManagerAlert[] }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">管理提醒</h2>
          <p className="mt-1 text-sm text-muted">自动标出需要管理者关注的招聘卡点</p>
        </div>
        <Badge tone={alerts.length > 0 ? 'warning' : 'success'}>
          {alerts.length > 0 ? `${alerts.length} 项待处理` : '暂无明显卡点'}
        </Badge>
      </div>
      <Card variant="elevated" className="overflow-hidden">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
            <Clock3 className="h-4 w-4 text-success-600" />
            当前没有候选人长时间卡住，也没有逾期未填的面试反馈。
          </div>
        ) : (
          <div className="divide-y divide-hairline-soft">
            {alerts.slice(0, 4).map((alert) => (
              <Link
                key={`${alert.kind}-${alert.jobId}-${alert.candidateId}-${alert.stage}`}
                to={alert.actionPath}
                className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface-soft focus:outline-none focus-visible:bg-surface-soft"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{alert.title}</span>
                    <Badge tone={alertTone(alert.priority)}>{alertKindLabel(alert.kind)}</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted">{alert.detail}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
