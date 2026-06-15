// 简历库页面 — 展示上传后由 AI 解析出的候选人简历摘要、技能标签与筛选结果。

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Target, Upload, Users } from 'lucide-react';
import { candidatesApi as api } from '../api';
import { formatDate } from '../../../lib/formatDate';
import { useDebounce } from '../../../lib/useDebounce';
import { useAsync } from '../../../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
} from '../../../components/ui';
import { Reveal, AnimatedNumber } from '../../../components/motion';
import type { CandidateListItem, CandidateTag } from '../types';

const TAG_TONES = ['accent', 'purple', 'teal', 'info', 'neutral'] as const;

function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function searchableText(candidate: CandidateListItem): string {
  const exp = candidate.latest_experience;
  return [
    candidate.name_masked,
    candidate.email_masked,
    candidate.phone_masked,
    candidate.education_summary,
    exp?.company,
    exp?.position,
    exp?.duration,
    ...candidateTags(candidate).map((t) => t.tag),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreTone(score: number) {
  if (score >= 5) return 'success';
  if (score >= 4) return 'accent';
  if (score >= 3) return 'warning';
  return 'neutral';
}

function ScorePill({ score }: { score: number }) {
  if (!score) return <span className="text-muted-soft">—</span>;
  return <Badge tone={scoreTone(score)}>{score} 分</Badge>;
}

function ResumeSummary({ candidate }: { candidate: CandidateListItem }) {
  const exp = candidate.latest_experience;
  return (
    <div className="min-w-[220px] space-y-1">
      {exp?.company || exp?.position ? (
        <p className="font-medium text-ink">
          {[exp.position, exp.company].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <p className="text-muted-soft">暂无工作经历</p>
      )}
      {exp?.duration && <p className="text-xs text-muted-soft">{exp.duration}</p>}
      {candidate.education_summary && (
        <p className="text-xs text-muted">{candidate.education_summary}</p>
      )}
    </div>
  );
}

function SkillBadges({ candidate }: { candidate: CandidateListItem }) {
  const tags = candidateTags(candidate);
  if (tags.length === 0) return <span className="text-muted-soft">暂无标签</span>;
  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {tags.slice(0, 5).map((skill, index) => (
        <Badge key={`${skill.tag}-${skill.score}`} tone={TAG_TONES[index % TAG_TONES.length]}>
          {skill.tag} · {skill.score}
        </Badge>
      ))}
      {candidate.tag_count > tags.length && (
        <Badge tone="neutral">+{candidate.tag_count - tags.length}</Badge>
      )}
    </div>
  );
}

function SourceSummary({ candidate }: { candidate: CandidateListItem }) {
  const source = candidate.source;
  if (!source) return <span className="text-muted-soft">未记录来源</span>;
  return (
    <div className="min-w-[160px] space-y-1 text-xs">
      <p className="font-medium text-ink">
        来源渠道：{source.channel || '未填写'}
      </p>
      <p className="text-muted">
        目标岗位：{source.target_job_title || '未关联'}
      </p>
      {source.referrer && <p className="text-muted-soft">推荐人：{source.referrer}</p>}
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateListItem }) {
  return (
    <tr className="border-b border-hairline-soft transition-colors hover:bg-surface-soft last:border-0">
      <td className="px-5 py-4">
        <div className="min-w-[180px]">
          <Link
            to={`/candidates/${candidate.id}`}
            className="font-medium text-ink hover:underline"
          >
            {candidate.name_masked || `候选人 #${candidate.id}`}
          </Link>
          <div className="mt-1 space-y-0.5 text-xs text-muted-soft">
            {candidate.email_masked && <p>{candidate.email_masked}</p>}
            {candidate.phone_masked && <p>{candidate.phone_masked}</p>}
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-sm">
        <ResumeSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <SkillBadges candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <SourceSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <ScorePill score={candidate.max_score ?? 0} />
      </td>
      <td className="px-5 py-4 text-sm text-muted">{formatDate(candidate.created_at)}</td>
      <td className="px-5 py-4 text-right">
        <Link
          to={`/candidates/${candidate.id}`}
          className="text-xs font-medium text-accent-blue transition-colors hover:underline"
        >
          查看完整简历
        </Link>
      </td>
    </tr>
  );
}

export function CandidatesPage() {
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [scoreFilter, setScoreFilter] = useState('0');
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 300);

  const { data, loading, error, reload } = useAsync(
    () => api.searchCandidates({
      search: debouncedQuery || undefined,
      page,
      per_page: 20,
      sort_by: 'created_at',
      sort_order: 'desc',
    }),
    [debouncedQuery, page],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const totalCandidates = data?.total ?? candidates.length;

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      for (const skill of candidateTags(candidate)) {
        counts.set(skill.tag, (counts.get(skill.tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 30);
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minScore = Number(scoreFilter);
    return candidates
      .filter((candidate) => {
        const matchesQuery = !normalizedQuery || searchableText(candidate).includes(normalizedQuery);
        const matchesTag =
          tagFilter === 'all' || candidateTags(candidate).some((skill) => skill.tag === tagFilter);
        const matchesScore = (candidate.max_score ?? 0) >= minScore;
        return matchesQuery && matchesTag && matchesScore;
      })
      .sort((a, b) => {
        const scoreDiff = (b.max_score ?? 0) - (a.max_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, query, scoreFilter, tagFilter]);

  const uniqueTagCount = tagOptions.length;
  const highScoreCount = candidates.filter((c) => (c.max_score ?? 0) >= 4).length;

  function resetFilters() {
    setQuery('');
    setTagFilter('all');
    setScoreFilter('0');
    setPage(1);
  }

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
        <h1 className="mb-1 text-2xl font-display text-ink">简历库</h1>
        <div className="mt-6">
          <ErrorState message={error.message} onRetry={reload} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="简历库"
        description={
          <>
            已匹配 <AnimatedNumber value={totalCandidates} /> 份简历 · 当前页 AI 技能标签{' '}
            <AnimatedNumber value={uniqueTagCount} /> 类
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/jobs">
              <Button variant="secondary">
                <Target className="h-4 w-4" />
                岗位匹配
              </Button>
            </Link>
            <Link to="/upload">
              <Button variant="accent">
                <Upload className="h-4 w-4" />
                上传简历
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-muted-soft">简历总量</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              <AnimatedNumber value={candidates.length} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-muted-soft">当前页高分候选人</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              <AnimatedNumber value={highScoreCount} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-muted-soft">可筛选技能</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              <AnimatedNumber value={uniqueTagCount} />
            </p>
          </CardBody>
        </Card>
      </div>

      {candidates.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            icon={Users}
            title="暂无简历"
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
        <>
          <Card>
            <CardBody>
              <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
                <Input
                  label="搜索简历"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="姓名、邮箱、公司、岗位、学校或技能"
                />
                <Select
                  label="技能标签"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                >
                  <option value="all">全部技能</option>
                  {tagOptions.map(([tag, count]) => (
                    <option key={tag} value={tag}>
                      {tag}（{count}）
                    </option>
                  ))}
                </Select>
                <Select
                  label="最低技能分"
                  value={scoreFilter}
                  onChange={(event) => setScoreFilter(event.target.value)}
                >
                  <option value="0">全部分数</option>
                  <option value="3">3 分及以上</option>
                  <option value="4">4 分及以上</option>
                  <option value="5">5 分</option>
                </Select>
                <div className="flex items-end">
                  <Button variant="secondary" onClick={resetFilters}>
                    <RotateCcw className="h-4 w-4" />
                    重置
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card variant="elevated">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>简历库列表</CardTitle>
                <span className="text-xs text-muted-soft">
                  当前显示 {filteredCandidates.length} / {candidates.length} 份
                </span>
              </div>
            </CardHeader>
            {filteredCandidates.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Users}
                  title="没有符合条件的简历"
                  description="调整搜索词、技能标签或最低分后再查看"
                />
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
	                      <th className="px-5 py-3">候选人</th>
	                      <th className="px-5 py-3">简历摘要</th>
	                      <th className="px-5 py-3">AI 技能标签</th>
	                      <th className="px-5 py-3">来源信息</th>
	                      <th className="px-5 py-3">最高分</th>
                      <th className="px-5 py-3">入库时间</th>
                      <th className="px-5 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <Reveal as="tbody" stagger={0.035} y={10}>
                    {filteredCandidates.map((candidate) => (
                      <CandidateRow key={candidate.id} candidate={candidate} />
                    ))}
                  </Reveal>
                </table>
              </div>
            )}
            {data && data.pages > 1 && (
              <div className="border-t border-hairline px-5 py-3">
                <Pagination
                  page={data.page}
                  totalPages={data.pages}
                  onChange={setPage}
                  summary={`第 ${data.page} / ${data.pages} 页，共 ${data.total} 条`}
                />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
