import { AlertTriangle, CalendarCheck2 } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import { roundLabel } from '../../lib/interviewRecords';
import type { InterviewAssignment } from '../../types';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '../ui';

interface MyInterviewsPanelProps {
  assignments: InterviewAssignment[];
  onStartFeedback?: (assignment: InterviewAssignment) => void;
}

export function MyInterviewsPanel({ assignments, onStartFeedback }: MyInterviewsPanelProps) {
  const pending = assignments.filter((item) => !item.feedbackSubmitted);
  const overdue = assignments.filter((item) => item.isOverdue);
  const done = assignments.filter((item) => item.feedbackSubmitted);
  const focusItems = [...overdue, ...pending.filter((item) => !item.isOverdue)].slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>我的面试</CardTitle>
            <p className="mt-1 text-xs text-muted-soft">待反馈、超时提醒和近期安排集中在这里</p>
          </div>
          <CalendarCheck2 className="h-5 w-5 text-muted" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2">
            <p className="text-xs text-muted-soft">待反馈</p>
            <p className="mt-1 text-xl font-semibold text-ink">{pending.length}</p>
          </div>
          <div className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2">
            <p className="text-xs text-danger-700">超时待反馈</p>
            <p className="mt-1 text-xl font-semibold text-danger-700">{overdue.length}</p>
          </div>
          <div className="rounded-md border border-success-100 bg-success-50 px-3 py-2">
            <p className="text-xs text-success-700">已反馈</p>
            <p className="mt-1 text-xl font-semibold text-success-700">{done.length}</p>
          </div>
        </div>

        {focusItems.length > 0 && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {focusItems.map((item) => (
              <div key={item.id} className="rounded-md border border-hairline bg-canvas px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink">{item.nameMasked ?? `候选人 #${item.candidateId}`}</p>
                      <Badge tone={item.isOverdue ? 'danger' : 'warning'}>
                        {item.isOverdue ? '超时待反馈' : roundLabel(item.round)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted">{item.jobTitle ?? `岗位 #${item.jobId}`}</p>
                    <p className="mt-1 text-xs text-muted-soft">
                      {item.scheduledAt ? formatDate(item.scheduledAt) : '未定时间'}
                      {item.interviewerName ? ` · ${item.interviewerName}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {item.isOverdue && <AlertTriangle className="h-4 w-4 text-danger-700" aria-hidden="true" />}
                    {onStartFeedback && !item.feedbackSubmitted && (
                      <Button
                        type="button"
                        size="sm"
                        variant={item.isOverdue ? 'danger' : 'secondary'}
                        onClick={() => onStartFeedback(item)}
                      >
                        填写反馈
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
