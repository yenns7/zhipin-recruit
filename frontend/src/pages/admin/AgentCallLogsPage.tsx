// 管理员 AI 调用日志审计页。
// 展示每次 AI 调用（chat / tool_write）的模型、token、耗时、状态、工具链，
// 支持筛选与分页，点击展开查看完整输入/输出/思考过程。

import { useState } from 'react';
import {
  Activity, ChevronDown, ChevronRight, Clock, Cpu, Search, Zap,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import {
  Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState,
  PageHeader, Pagination, Select, Spinner,
} from '../../components/ui';
import type { AgentCallLogItem, CallLogListResponse } from '../../types';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  ok: 'success',
  error: 'danger',
  aborted: 'warning',
  timeout: 'warning',
};

const KIND_LABEL: Record<string, string> = {
  chat: '对话',
  tool_write: '写操作',
  tool_read: '查询工具',
};

export function AgentCallLogsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, loading, error, reload } = useAsync<CallLogListResponse>(
    () =>
      api.listCallLogs({
        page,
        per_page: 20,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(kindFilter ? { kind: kindFilter } : {}),
      }),
    [page, statusFilter, kindFilter],
  );

  const items = data?.items ?? [];

  // 统计卡（基于当前页数据聚合，轻量）
  const stats = computeStats(items);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 调用日志"
        description="审计每次 AI 调用的输入输出、模型、token、耗时与工具链 · 仅管理员可见"
        eyebrow={<Badge tone="glass">审计</Badge>}
      />

      {/* 统计卡 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Activity} label="本页调用数" value={String(items.length)} />
        <StatCard
          icon={Zap}
          label="总 token"
          value={String(stats.totalTokens)}
        />
        <StatCard
          icon={Clock}
          label="平均耗时"
          value={stats.avgDurationMs !== null ? `${stats.avgDurationMs} ms` : '—'}
        />
        <StatCard
          icon={Cpu}
          label="错误数"
          value={String(stats.errorCount)}
          tone={stats.errorCount > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* 筛选 */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">全部状态</option>
            <option value="ok">成功</option>
            <option value="error">错误</option>
            <option value="aborted">中断</option>
            <option value="timeout">超时</option>
          </Select>
          <Select
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">全部类型</option>
            <option value="chat">对话</option>
            <option value="tool_write">写操作</option>
          </Select>
        </CardBody>
      </Card>

      {/* 列表 */}
      <Card>
        <CardHeader>
          <CardTitle>调用记录</CardTitle>
        </CardHeader>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="暂无调用记录"
            description="AI 助手产生调用后，这里会显示每次调用的详细日志。"
          />
        ) : (
          <div className="divide-y divide-hairline-soft">
            {items.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={() =>
                  setExpandedId(expandedId === log.id ? null : log.id)
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* 分页 */}
      {data && data.total > data.per_page && (
        <Pagination
          page={data.page}
          totalPages={Math.ceil(data.total / data.per_page)}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AgentCallLogItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const created = log.created_at
    ? new Date(log.created_at).toLocaleString('zh-CN', { hour12: false })
    : '—';
  const toolCalls = Array.isArray(log.tool_calls) ? log.tool_calls : [];

  return (
    <div className="px-5 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        )}
        <span className="shrink-0 text-xs text-muted-soft">{`#${log.id}`}</span>
        <Badge tone={STATUS_TONE[log.status] ?? 'neutral'}>
          {log.status}
        </Badge>
        <Badge tone="glass">{KIND_LABEL[log.kind] ?? log.kind}</Badge>
        <span className="shrink-0 text-xs text-muted">{created}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-body">
          {log.input_text ?? '（无输入）'}
        </span>
        <span className="shrink-0 text-xs text-muted-soft">
          {log.model ?? '—'} · {log.prompt_tokens ?? 0}+{log.completion_tokens ?? 0} tok ·{' '}
          {log.duration_ms ?? '—'}ms
        </span>
      </button>

      {expanded && (
        <div className="mt-3 ml-7 space-y-3 text-sm">
          {/* 工具调用链 */}
          {toolCalls.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-soft">工具调用</p>
              <div className="space-y-1">
                {toolCalls.map((tc, i) => (
                  <code
                    key={i}
                    className="block rounded bg-surface-soft px-2 py-1 text-xs text-body"
                  >
                    {typeof tc === 'object' && tc !== null
                      ? JSON.stringify(tc)
                      : String(tc)}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* 输入 */}
          {log.input_text && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-soft">输入</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 text-xs leading-6 text-body">
                {log.input_text}
              </pre>
            </div>
          )}

          {/* 输出 */}
          {log.output_text && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-soft">输出</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-soft p-3 text-xs leading-6 text-body">
                {log.output_text}
              </pre>
            </div>
          )}

          {/* 思考过程 */}
          {Array.isArray(log.thoughts) && log.thoughts.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-soft">思考过程</p>
              <ul className="space-y-0.5 text-xs text-body">
                {(log.thoughts as string[]).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-soft">·</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 错误 */}
          {log.error_msg && (
            <div className="rounded-md bg-danger-50 px-3 py-2 text-xs text-danger-700">
              <span className="font-medium">错误：</span>
              {log.error_msg}
            </div>
          )}

          {/* 元数据 */}
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span>用户 #{log.user_id}（{log.role}）</span>
            {log.conversation_id && <span>会话 #{log.conversation_id}</span>}
            {log.model && <span>模型：{log.model}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-md ${
            tone === 'danger' ? 'bg-danger-50 text-danger-700' : 'bg-surface-soft text-ink'
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-soft">{label}</p>
          <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function computeStats(items: AgentCallLogItem[]) {
  let totalTokens = 0;
  let totalDuration = 0;
  let durationCount = 0;
  let errorCount = 0;
  for (const it of items) {
    totalTokens += (it.prompt_tokens ?? 0) + (it.completion_tokens ?? 0);
    if (it.duration_ms !== null) {
      totalDuration += it.duration_ms;
      durationCount += 1;
    }
    if (it.status !== 'ok') errorCount += 1;
  }
  return {
    totalTokens,
    avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : null,
    errorCount,
  };
}
