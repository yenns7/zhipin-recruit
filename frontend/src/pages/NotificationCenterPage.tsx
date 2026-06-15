import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  TableSkeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatDate';
import { useAsync } from '../lib/useAsync';
import type { NotificationItem } from '../types';

const TYPE_LABELS: Record<string, string> = {
  stage_change: '流程变更',
  interview_done: '面试完成',
  feedback_added: '面试反馈',
  candidate_uploaded: '简历上传',
  candidate_reassigned: '候选人转派',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function NotificationCenterPage() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(
    () => api.getNotifications(page),
    [page],
  );

  async function markAllRead() {
    await api.markNotificationsRead();
    await reload();
  }

  async function openNotification(notification: NotificationItem) {
    if (!notification.is_read) {
      await api.markNotificationsRead([notification.id]);
      await reload();
    }
    if (notification.link) {
      navigate(notification.link);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知中心"
        description={data ? `${data.unread_count} 条未读通知` : '查看你的待办提醒和系统消息'}
        eyebrow={<Badge tone="glass">个人消息</Badge>}
        actions={
          data && data.unread_count > 0 ? (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" />
              全部已读
            </Button>
          ) : undefined
        }
      />

      {loading && <TableSkeleton rows={5} cols={3} />}
      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && data && data.notifications.length === 0 && (
        <EmptyState title="暂无通知" description="有新的流程变化或提醒时，会出现在这里。" />
      )}
      {!loading && !error && data && data.notifications.length > 0 && (
        <div className="space-y-3">
          {data.notifications.map((notification) => (
            <Card
              key={notification.id}
              className={notification.is_read ? 'opacity-70' : ''}
            >
              <CardBody
                className="flex cursor-pointer items-start gap-3 py-3"
                onClick={() => openNotification(notification)}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-soft text-ink">
                  <Bell
                    className={notification.is_read ? 'h-4 w-4 text-muted-soft' : 'h-4 w-4 text-accent-blue'}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="glass">{typeLabel(notification.type)}</Badge>
                    {!notification.is_read && (
                      <span className="h-2 w-2 rounded-full bg-accent-blue" aria-label="未读" />
                    )}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-ink">
                    {notification.title}
                  </span>
                  {notification.body && (
                    <span className="mt-1 block text-sm text-muted">
                      {notification.body}
                    </span>
                  )}
                  <span className="mt-2 block text-xs text-muted-soft">
                    {notification.created_at ? formatDate(notification.created_at) : '-'}
                  </span>
                </span>
              </CardBody>
            </Card>
          ))}

          <Pagination
            page={data.page}
            totalPages={data.pages}
            onChange={setPage}
            summary={`共 ${data.total} 条`}
          />
        </div>
      )}
    </div>
  );
}
