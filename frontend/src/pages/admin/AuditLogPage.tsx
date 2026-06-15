import { Badge, EmptyState, ErrorState, Pagination, TableSkeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/formatDate';
import { useAsync } from '../../lib/useAsync';
import type { AuditLogItem } from '../../types';
import { useState } from 'react';

const ACTION_LABELS: Record<string, string> = {
  'job.created': '创建岗位',
  'job.updated': '编辑岗位',
  'job.closed': '关闭岗位',
  'pipeline.moved': '流程推进',
  'candidate.onboarded': '候选人入职',
  'candidate.reassigned': '候选人转派',
  'candidate.disposition': '淘汰/入库记录',
  'resume.uploaded': '上传简历',
  'resume.upload_batch.created': '创建上传批次',
  'interview.started': '发起面试',
  'interview.scored': '面试评分',
  'interview.feedback': '面试反馈',
  'interview.assigned': '安排面试',
  'match.run': '运行匹配',
  'offer.saved': '保存 Offer',
  'user.role_changed': '角色变更',
  'user.active_changed': '账号状态变更',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function targetLabel(log: AuditLogItem): string {
  if (!log.entity_type && !log.entity_id) return '-';
  if (!log.entity_id) return log.entity_type ?? '-';
  return `${log.entity_type ?? '记录'} #${log.entity_id}`;
}

function payloadLabel(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return '-';
  return JSON.stringify(payload);
}

export function AuditLogContent() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(
    () => api.getAuditLogs({ page, per_page: 50 }),
    [page],
  );

  if (loading) {
    return <TableSkeleton rows={6} cols={5} />;
  }

  if (error || !data) {
    return <ErrorState message={error?.message ?? '加载审计日志失败'} onRetry={reload} />;
  }

  if (data.logs.length === 0) {
    return <EmptyState title="暂无审计日志" description="系统出现写操作后会在这里留下记录。" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">共 {data.total} 条操作记录</p>
        <Badge tone="glass">只读</Badge>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline bg-canvas">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-hairline bg-surface-soft text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">操作人</th>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">目标</th>
              <th className="px-4 py-3">详情</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((log) => (
              <tr key={`${log.source}-${log.id}`} className="border-b border-hairline last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {log.ts ? formatDate(log.ts) : '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                  {log.actor_name || `用户 #${log.actor_id ?? '-'}`}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">{actionLabel(log.action)}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {targetLabel(log)}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-soft">
                  {payloadLabel(log.payload)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={data.page}
        totalPages={data.pages}
        onChange={setPage}
        summary={`每页 ${data.per_page} 条`}
        className="justify-end"
      />
    </div>
  );
}

export function AuditLogPage() {
  return (
    <div className="space-y-6">
      <AuditLogContent />
    </div>
  );
}
