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
  'job.restored': '恢复岗位',
  'candidate.viewed': '查看候选人',
  'candidate.exported': '导出候选人',
  'candidate.deleted': '删除候选人',
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
  'agent.write': 'AI 写操作',
  'security.forbidden': '越权拦截',
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

function resultLabel(result: string): string {
  if (result === 'success') return '成功';
  if (result === 'denied') return '已拦截';
  if (result === 'failure') return '失败';
  return result || '-';
}

function resultTone(result: string, severity: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (severity === 'warning') return 'danger';
  if (result === 'success') return 'success';
  if (result === 'denied' || result === 'failure') return 'danger';
  return 'neutral';
}

function severityTone(severity: string): 'danger' | 'neutral' {
  return severity === 'warning' ? 'danger' : 'neutral';
}

function sourceLabel(source: string): string {
  if (source === 'ai') return 'AI';
  if (source === 'security') return '安全';
  if (source === 'ui') return '页面';
  return source || '-';
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
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-hairline bg-surface-soft text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3">时间</th>
              <th className="px-4 py-3">结果</th>
              <th className="px-4 py-3">操作人</th>
              <th className="px-4 py-3">操作</th>
              <th className="px-4 py-3">目标</th>
              <th className="px-4 py-3">请求</th>
              <th className="px-4 py-3">详情</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.map((log) => (
              <tr
                key={`${log.source}-${log.id}`}
                className={`border-b border-hairline last:border-0 ${
                  log.severity === 'warning' ? 'bg-danger-50/60' : ''
                }`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {log.ts ? formatDate(log.ts) : '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Badge tone={resultTone(log.result, log.severity)}>
                    {resultLabel(log.result)}
                  </Badge>
                  {log.severity === 'warning' && (
                    <Badge tone={severityTone(log.severity)} className="ml-2">
                      告警
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                  <div>{log.actor_name || `用户 #${log.actor_id ?? '-'}`}</div>
                  <div className="mt-1 text-xs font-normal text-muted-soft">
                    {log.actor_role || '-'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="neutral">{actionLabel(log.action)}</Badge>
                  <span className="ml-2 text-xs text-muted-soft">{sourceLabel(log.event_source)}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {targetLabel(log)}
                </td>
                <td className="max-w-[220px] px-4 py-3 text-xs text-muted-soft">
                  <div className="truncate">request_id: {log.request_id || '-'}</div>
                  <div className="truncate">IP: {log.ip || '-'}</div>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-soft">
                  {log.failure_reason ? `${log.failure_reason} · ` : ''}
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
