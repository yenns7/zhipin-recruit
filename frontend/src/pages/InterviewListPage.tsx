import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate } from '../lib/formatDate';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Spinner,
  EmptyState,
  ErrorState,
  PageHeader,
  Badge,
} from '../components/ui';

const ROUND_LABEL: Record<string, string> = {
  interview_first: '一面',
  interview_second: '二面',
  interview_final: '终面',
};

export function InterviewListPage() {
  const { data, loading, error, reload } = useAsync(() => api.listInterviews(), []);
  const items = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="面试记录"
        description="历史 AI 预筛与面试官评分"
        actions={
          <Link to="/interviews/new">
            <Button>发起 AI 面试</Button>
          </Link>
        }
      />

      {loading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}

      {!loading && !error && items.length === 0 && (
        <Card>
          <EmptyState
            icon={Bot}
            title="暂无面试记录"
            description="发起一次 AI 面试或录入面试官评分后，记录会出现在这里"
          />
        </Card>
      )}

      {!loading && !error && items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>记录列表</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">类型</th>
                  <th className="px-5 py-3">候选人</th>
                  <th className="px-5 py-3">岗位</th>
                  <th className="px-5 py-3">评分</th>
                  <th className="px-5 py-3">结果</th>
                  <th className="px-5 py-3">时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={`${it.type}-${it.id}`}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="px-5 py-3">
                      {it.type === 'ai' ? (
                        <Badge tone="brand">AI 预筛</Badge>
                      ) : (
                        <Badge tone="warning">
                          {it.round ? (ROUND_LABEL[it.round] ?? '面试') : '面试'}评分
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink">
                      {it.name_masked ?? `#${it.candidate_id}`}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {it.job_title ?? `#${it.job_id}`}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{it.score ?? '—'}</td>
                    <td className="px-5 py-3">
                      {it.pass === null ? (
                        '—'
                      ) : it.pass ? (
                        <span className="text-success-600">通过</span>
                      ) : (
                        <span className="text-danger-600">不通过</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {it.created_at ? formatDate(it.created_at) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {it.type === 'ai' ? (
                        <Link
                          to={`/interviews/${it.id}`}
                          className="text-xs font-medium text-ink hover:underline"
                        >
                          查看报告
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-soft">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
