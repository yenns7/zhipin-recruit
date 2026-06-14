// 候选人列表页 — Apple 风格表格，多彩标签，行 hover 微浮。

import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatDate';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, CardHeader, CardTitle, Spinner, EmptyState, ErrorState, PageHeader } from '../components/ui';
import { Reveal, AnimatedNumber } from '../components/motion';

const TAG_TONES = ['accent', 'purple', 'teal', 'info', 'neutral'] as const;

export function CandidatesPage() {
  const { data, loading, error, reload } = useAsync(() => api.listCandidates(), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-display text-ink">候选人</h1>
        <div className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  const candidates = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="候选人"
        description={
          <>
            管理候选人简历库，共 <AnimatedNumber value={candidates.length} /> 位候选人
          </>
        }
        actions={
          <Link to="/upload">
            <Button variant="accent">上传简历</Button>
          </Link>
        }
      />

      {candidates.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            icon={Users}
            title="暂无候选人"
            description={
              <>
                先{' '}
                <Link to="/upload" className="font-medium text-ink hover:underline">
                  上传简历
                </Link>{' '}
                以添加候选人到简历库
              </>
            }
          />
        </Card>
      ) : (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>候选人列表</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">姓名</th>
                  <th className="px-5 py-3">技能标签</th>
                  <th className="px-5 py-3">录入时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <Reveal as="tbody" stagger={0.04} y={10}>
                {candidates.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-hairline-soft transition-all duration-200 hover:bg-surface-soft"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ink">{c.name_masked}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {c.tag_count > 0 ? (
                        <Badge tone={TAG_TONES[c.tag_count % TAG_TONES.length]}>
                          {c.tag_count} 个标签
                        </Badge>
                      ) : (
                        <span className="text-muted-soft">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted">{formatDate(c.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        to={`/candidates/${c.id}`}
                        className="text-xs font-medium text-accent-blue hover:underline transition-colors"
                      >
                        查看档案
                      </Link>
                    </td>
                  </tr>
                ))}
              </Reveal>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}