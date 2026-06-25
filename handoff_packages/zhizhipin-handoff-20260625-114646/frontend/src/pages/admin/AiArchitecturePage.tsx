import { Brain, Database, FileText, LockKeyhole, ShieldCheck, Wrench } from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Spinner,
} from '../../components/ui';
import type { AdminAiTool } from '../../types';

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof Brain;
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-soft text-ink">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted-soft">{label}</p>
          <div className="mt-1">
            <Badge tone={tone}>{value}</Badge>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ToolList({ tools }: { tools: AdminAiTool[] }) {
  return (
    <div className="divide-y divide-hairline-soft">
      {tools.map((tool) => (
        <div key={tool.name} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface-soft px-2 py-1 text-xs text-ink">
              {tool.name}
            </code>
            {tool.write && <Badge tone="warning">写操作</Badge>}
            {tool.rbac && <Badge tone="neutral">{tool.rbac.join(' / ')}</Badge>}
          </div>
          <p className="mt-2 text-sm text-body">{tool.description}</p>
          {Object.keys(tool.params ?? {}).length > 0 && (
            <p className="mt-1 text-xs text-muted">
              参数：{Object.entries(tool.params).map(([k, v]) => `${k}=${v}`).join('；')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function AiArchitectureContent() {
  const { data, loading, error, reload } = useAsync(() => api.getAdminAiArchitecture(), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error?.message ?? '加载失败'} onRetry={reload} />;
  }

  const permissions = data.permission_model;
  const readGuarded = !permissions.read_tools_available_to_authenticated_users;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={Brain} label="查询工具" value={`${data.read_tools.length} 个`} />
        <StatCard icon={Wrench} label="写操作工具" value={`${data.write_tools.length} 个`} tone="warning" />
        <StatCard
          icon={Database}
          label="数据库接入"
          value={permissions.database_access ? '已接入' : '未接入'}
          tone={permissions.database_access ? 'success' : 'neutral'}
        />
        <StatCard
          icon={LockKeyhole}
          label="写操作保护"
          value={permissions.write_requires_confirmation ? '需确认' : '无确认'}
          tone={permissions.write_requires_confirmation ? 'success' : 'danger'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>权限边界</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div
            className={[
              'rounded-md border px-4 py-3',
              readGuarded ? 'border-success-200 bg-success-50' : 'border-warning-200 bg-warning-50',
            ].join(' ')}
          >
            <p className={[
              'text-sm font-medium',
              readGuarded ? 'text-success-800' : 'text-warning-800',
            ].join(' ')}
            >
              {readGuarded ? 'AI 助手入口已按角色收口' : '读数据权限偏大'}
            </p>
            <p className={[
              'mt-1 text-sm',
              readGuarded ? 'text-success-700' : 'text-warning-700',
            ].join(' ')}
            >
              {permissions.read_scope_note}
            </p>
          </div>
          <div className="rounded-md border border-success-200 bg-success-50 px-4 py-3">
            <p className="text-sm font-medium text-success-800">改数据有确认和角色限制</p>
            <p className="mt-1 text-sm text-success-700">{permissions.write_scope_note}</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">AI 助手不能做的事</p>
            <div className="flex flex-wrap gap-2">
              {permissions.cannot_do.map((item) => (
                <Badge key={item} tone="neutral">{item}</Badge>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              系统提示词原文
            </CardTitle>
          </CardHeader>
          <CardBody>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md bg-surface-soft p-4 text-xs leading-6 text-body">
              {data.system_prompt}
            </pre>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>查询工具</CardTitle>
            </CardHeader>
            <ToolList tools={data.read_tools} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>写操作工具</CardTitle>
            </CardHeader>
            <ToolList tools={data.write_tools} />
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>后端架构链路</CardTitle>
        </CardHeader>
        <div className="grid gap-0 divide-y divide-hairline-soft md:grid-cols-2 md:divide-x md:divide-y-0">
          {data.architecture.map((layer) => (
            <div key={layer.name} className="px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-semibold text-ink">{layer.name}</h3>
              </div>
              <p className="mt-2 text-sm text-body">{layer.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {layer.files.map((file) => (
                  <code key={file} className="rounded bg-surface-soft px-2 py-1 text-xs text-muted">
                    {file}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>建议下一步</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-2 text-sm text-body">
            {data.recommended_next_steps.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ink" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

export function AiArchitecturePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 提示词看板"
        description="管理员只读查看：AI 助手提示词、工具能力、权限边界和后端接入方式"
        eyebrow={<Badge tone="glass">仅管理员可见</Badge>}
      />
      <AiArchitectureContent />
    </div>
  );
}
