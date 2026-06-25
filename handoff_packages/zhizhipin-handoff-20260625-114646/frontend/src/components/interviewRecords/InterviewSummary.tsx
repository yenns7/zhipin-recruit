import { Activity, CheckCircle2, ClipboardList, Clock3, XCircle } from 'lucide-react';
import type { InterviewStats } from '../../lib/interviewRecords';
import { Card } from '../ui';

interface InterviewSummaryProps {
  stats: InterviewStats;
}

const items = [
  { key: 'today', label: '今日反馈', icon: Clock3, tone: 'text-brand-700' },
  { key: 'pending', label: '待填写反馈', icon: ClipboardList, tone: 'text-warning-700' },
  { key: 'passed', label: '通过', icon: CheckCircle2, tone: 'text-success-700' },
  { key: 'failed', label: '不通过', icon: XCircle, tone: 'text-danger-700' },
] as const;

export function InterviewSummary({ stats }: InterviewSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.key} className="px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                  {stats[item.key]}
                </p>
              </div>
              <Icon className={`h-5 w-5 ${item.tone}`} />
            </div>
          </Card>
        );
      })}

      <Card className="px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-muted">平均分</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {stats.avgScore ?? '—'}
            </p>
          </div>
          <Activity className="h-5 w-5 text-accent-blue" />
        </div>
      </Card>
    </div>
  );
}
