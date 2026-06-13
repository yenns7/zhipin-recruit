// 岗位匹配页 — 展示与当前岗位匹配的候选人排名及标签分析。

import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
} from '../components/ui';
import type { MatchResultItem } from '../types';
import { Reveal, AnimatedNumber } from '../components/motion';

// Score badge: colour shifts with the score value (0–1 range from backend).
// Uses a plain span instead of Badge to avoid class-collision with Badge's
// built-in px-2.5/py-0.5/text-xs (cn is plain concat, not tailwind-merge).
function ScoreBadge({ score }: { score: number }) {
  // Clamp to [0, 1] defensively then display as percentage.
  const clamped = Math.min(1, Math.max(0, score));
  const pct = Math.round(clamped * 100);

  const colorClass =
    pct >= 70
      ? 'bg-success-50 text-success-700'
      : pct >= 40
        ? 'bg-warning-50 text-warning-700'
        : 'bg-danger-50 text-danger-700';

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium tabular-nums ${colorClass}`}
    >
      <AnimatedNumber value={pct} suffix="%" />
    </span>
  );
}

// A single candidate match row.
function MatchRow({
  rank,
  item,
}: {
  rank: number;
  item: MatchResultItem;
}) {
  const matched = Array.isArray(item.matched_tags) ? item.matched_tags : [];
  const missing = Array.isArray(item.missing_tags) ? item.missing_tags : [];

  return (
    <tr className="border-b border-hairline-soft transition-colors hover:bg-surface-soft last:border-0">
      {/* Rank */}
      <td className="px-5 py-3.5 w-10">
        <span className="text-sm font-medium text-muted-soft">{rank}</span>
      </td>

      {/* Name — links to candidate profile */}
      <td className="px-5 py-3.5">
        <Link
          to={`/candidates/${item.candidate_id}`}
          className="font-medium text-ink hover:text-body hover:underline"
        >
          {item.name_masked}
        </Link>
      </td>

      {/* Score */}
      <td className="px-5 py-3.5">
        <ScoreBadge score={item.score} />
      </td>

      {/* Matched tags */}
      <td className="px-5 py-3.5">
        {matched.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {matched.map((tag) => (
              <Badge key={tag} tone="success">
                匹配 · {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-soft">—</span>
        )}
      </td>

      {/* Missing tags */}
      <td className="px-5 py-3.5">
        {missing.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {missing.map((tag) => (
              <Badge key={tag} tone="warning">
                欠缺 · {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-soft">—</span>
        )}
      </td>
    </tr>
  );
}

// ---- Page ----

export function JobMatchPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const isInvalidId = !id || Number.isNaN(jobId);

  // useAsync called unconditionally — short-circuits on invalid id, no NaN request fired.
  const { data, loading, error, reload } = useAsync(
    () =>
      isInvalidId
        ? Promise.reject(new Error('invalid id'))
        : api.matchJob(jobId),
    [jobId, isInvalidId]
  );

  // Invalid id guard — after all hooks
  if (isInvalidId) {
    return (
      <div>
        <Link
          to="/jobs"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-body"
        >
          ← 返回岗位管理
        </Link>
        <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          无效的岗位 ID
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb + header */}
      <div>
        <nav className="mb-2 flex items-center gap-1.5 text-sm text-muted">
          <Link to="/jobs" className="hover:text-body hover:underline">
            岗位管理
          </Link>
          <span className="text-muted-soft">›</span>
          <span className="text-ink">匹配候选人</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 font-display text-2xl text-ink">
              候选人匹配
            </h1>
            <p className="text-sm text-muted">岗位 ID：{jobId} · 按综合匹配度排序</p>
          </div>
          {!loading && (
            <Button variant="secondary" onClick={reload}>
              重新匹配
            </Button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardBody className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Spinner size="lg" />
            <p className="text-sm text-muted">正在为该岗位匹配候选人…</p>
          </CardBody>
        </Card>
      )}

      {/* Error state */}
      {!loading && error && (
        <div>
          <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
            {error.message}
            <button
              onClick={reload}
              className="ml-3 font-medium underline hover:no-underline"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && !error && data && (() => {
        // Sort defensively by score descending (backend already sorts, but be safe).
        const results = [...(data.results ?? [])].sort((a, b) => b.score - a.score);

        if (results.length === 0) {
          return (
            <Card>
              <CardBody className="flex flex-col items-center justify-center py-20 text-center">
                <svg
                  className="mb-3 h-10 w-10 text-surface-strong"
                  fill="none"
                  viewBox="0 0 48 48"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <circle cx="24" cy="20" r="8" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 42c0-8.837 7.163-16 16-16s16 7.163 16 16" />
                </svg>
                <p className="text-sm font-medium text-muted">简历池暂无匹配候选人</p>
                <p className="mt-1 text-xs text-muted-soft">请先在「候选人」模块上传简历，再进行匹配</p>
              </CardBody>
            </Card>
          );
        }

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>匹配结果</CardTitle>
                <span className="text-xs text-muted-soft">共 {results.length} 位候选人</span>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline-soft bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 w-10">排名</th>
                    <th className="px-5 py-3">候选人</th>
                    <th className="px-5 py-3">匹配度</th>
                    <th className="px-5 py-3">匹配技能</th>
                    <th className="px-5 py-3">欠缺技能</th>
                  </tr>
                </thead>
                <Reveal as="tbody" stagger={0.05} y={12}>
                  {results.map((item, i) => (
                    <MatchRow key={item.candidate_id} rank={i + 1} item={item} />
                  ))}
                </Reveal>
              </table>
            </div>
          </Card>
        );
      })()}
    </div>
  );
}
