// 简历库页面 — 展示上传后由 AI 解析出的候选人简历摘要、技能标签与筛选结果。

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Target, Upload, UserPlus, Users } from 'lucide-react';
import { candidatesApi as api } from '../api';
import { formatDate } from '../../../lib/formatDate';
import { useDebounce } from '../../../lib/useDebounce';
import { useAsync } from '../../../lib/useAsync';
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../../../lib/sourceChannels';
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
import type { CandidateListItem, CandidateTag, MatchResultItem, ParseStatus } from '../types';

const TAG_TONES = ['accent', 'purple', 'teal', 'info', 'neutral'] as const;
const COMMON_SOURCE_OPTIONS = RESUME_SOURCE_CHANNEL_OPTIONS.filter((channel) => channel !== '其他');
const COMMON_CITY_OPTIONS = [
  '北京',
  '上海',
  '深圳',
  '广州',
  '杭州',
  '成都',
  '武汉',
  '南京',
  '苏州',
  '西安',
  '长沙',
  '重庆',
  '天津',
  '厦门',
  '合肥',
  '郑州',
  '青岛',
  '宁波',
  '佛山',
  '东莞',
  '远程',
] as const;
const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '待解析',
  processing: '解析中',
  ok: '解析成功',
  failed: '解析失败',
};

function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function searchableText(candidate: CandidateListItem): string {
  const exp = candidate.latest_experience;
  return [
    candidate.name_masked,
    candidate.email_masked,
    candidate.phone_masked,
    candidate.intent_city,
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

function fitRecommendation(score: number, missingCount: number) {
  if (score >= 75 && missingCount <= 1) {
    return { label: '建议初筛', tone: 'success' as const };
  }
  if (score >= 45) {
    return { label: '谨慎推进', tone: 'warning' as const };
  }
  return { label: '暂不建议', tone: 'neutral' as const };
}

function fitScoreTone(score: number) {
  if (score >= 75) return 'success';
  if (score >= 45) return 'warning';
  return 'neutral';
}

function ParseStatusPill({ status }: { status?: ParseStatus }) {
  if (!status) return null;
  const tone = status === 'failed' ? 'danger' : status === 'ok' ? 'success' : 'warning';
  return <Badge tone={tone}>{PARSE_STATUS_LABELS[status]}</Badge>;
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
      {candidate.intent_city && (
        <p className="text-xs text-muted">意向城市：{candidate.intent_city}</p>
      )}
      {candidate.education_summary && (
        <p className="text-xs text-muted">{candidate.education_summary}</p>
      )}
    </div>
  );
}

function SkillBadges({ candidate }: { candidate: CandidateListItem }) {
  const tags = candidateTags(candidate);
  if (tags.length === 0) return <span className="text-muted-soft">暂无标签</span>;
  const visibleTags = tags.slice(0, 3);
  const hiddenCount = Math.max((candidate.tag_count ?? tags.length) - visibleTags.length, 0);
  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {visibleTags.map((skill, index) => (
        <Badge key={`${skill.tag}-${skill.score}`} tone={TAG_TONES[index % TAG_TONES.length]}>
          {skill.tag} · {skill.score}
        </Badge>
      ))}
      {hiddenCount > 0 && (
        <Badge tone="neutral">+{hiddenCount}</Badge>
      )}
    </div>
  );
}

function JobFitSummary({
  candidate,
  jobFit,
  hasTargetJob,
  loading,
  error,
}: {
  candidate: CandidateListItem;
  jobFit: MatchResultItem | null;
  hasTargetJob: boolean;
  loading: boolean;
  error: boolean;
}) {
  if (!hasTargetJob) {
    return <SkillBadges candidate={candidate} />;
  }

  if (loading) {
    return <span className="text-xs text-muted-soft">正在计算岗位匹配…</span>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-danger-600">岗位匹配预览失败</span>
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  if (!jobFit) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-muted-soft">暂无岗位匹配结果</span>
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  const matched = Array.isArray(jobFit.matched_tags) ? jobFit.matched_tags : [];
  const missing = Array.isArray(jobFit.missing_tags) ? jobFit.missing_tags : [];
  const recommendation = fitRecommendation(jobFit.score, missing.length);

  return (
    <div className="max-w-[460px] space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={fitScoreTone(jobFit.score)}>匹配 {jobFit.score}%</Badge>
        <Badge tone={recommendation.tone}>{recommendation.label}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {matched.length > 0 ? (
          matched.slice(0, 3).map((tag) => (
            <Badge key={`matched-${tag}`} tone="success">
              命中要求 · {tag}
            </Badge>
          ))
        ) : (
          <Badge tone="neutral">命中要求 · 暂无</Badge>
        )}
        {missing.slice(0, 2).map((tag) => (
          <Badge key={`missing-${tag}`} tone="warning">
            欠缺 · {tag}
          </Badge>
        ))}
        {missing.length > 2 && <Badge tone="neutral">欠缺 +{missing.length - 2}</Badge>}
      </div>
    </div>
  );
}

function SourceSummary({ candidate }: { candidate: CandidateListItem }) {
  const source = candidate.source;
  if (!source) {
    return (
      <div className="space-y-2">
        <span className="text-muted-soft">未记录来源</span>
        <div>
          <ParseStatusPill status={candidate.parse_status} />
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-[160px] space-y-1 text-xs">
      <p className="font-medium text-ink">
        来源渠道：{source.channel || '未填写'}
      </p>
      <p className="text-muted">
        目标岗位：{source.target_job_title || '未关联'}
      </p>
      {(source.target_job_city || source.target_job_department) && (
        <p className="text-muted-soft">
          岗位归属：{source.target_job_city || '未设置'} / {source.target_job_department || '未设置'}
        </p>
      )}
      {source.referrer && <p className="text-muted-soft">推荐人：{source.referrer}</p>}
      <div className="pt-1">
        <ParseStatusPill status={candidate.parse_status} />
      </div>
    </div>
  );
}

interface CandidateRowProps {
  candidate: CandidateListItem;
  targetJobId: string;
  jobFit: MatchResultItem | null;
  jobFitLoading: boolean;
  jobFitError: boolean;
  addingCandidateId: number | null;
  onAddToJob: (candidateId: number) => void;
}

function CandidateRow({
  candidate,
  targetJobId,
  jobFit,
  jobFitLoading,
  jobFitError,
  addingCandidateId,
  onAddToJob,
}: CandidateRowProps) {
  const isAdding = addingCandidateId === candidate.id;
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
        <JobFitSummary
          candidate={candidate}
          jobFit={jobFit}
          hasTargetJob={Boolean(targetJobId)}
          loading={jobFitLoading}
          error={jobFitError}
        />
      </td>
      <td className="px-5 py-4">
        <SourceSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <ScorePill score={candidate.max_score ?? 0} />
      </td>
      <td className="px-5 py-4 text-sm text-muted">{formatDate(candidate.created_at)}</td>
      <td className="px-5 py-4 text-right">
        <div className="flex flex-col items-end gap-2">
          <Link
            to={`/candidates/${candidate.id}`}
            className="text-xs font-medium text-accent-blue transition-colors hover:underline"
          >
            查看完整简历
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isAdding}
            disabled={!targetJobId || isAdding}
            onClick={() => onAddToJob(candidate.id)}
          >
            <UserPlus className="h-4 w-4" />
            加入该需求流程
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function CandidatesPage() {
  const [query, setQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sourceChannelFilter, setSourceChannelFilter] = useState('all');
  const [parseStatusFilter, setParseStatusFilter] = useState<'all' | ParseStatus>('all');
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<'all' | 'in_pipeline' | 'not_in_pipeline'>('all');
  const [scoreFilter, setScoreFilter] = useState('0');
  const [targetJobId, setTargetJobId] = useState('');
  const [addingCandidateId, setAddingCandidateId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query, 300);
  const jobsAsync = useAsync(() => api.listJobs(), []);

  const { data, loading, error, reload } = useAsync(
    () => api.searchCandidates({
      search: debouncedQuery || undefined,
      city: cityFilter === 'all' ? undefined : cityFilter,
      source_channel: sourceChannelFilter === 'all' ? undefined : sourceChannelFilter,
      parse_status: parseStatusFilter === 'all' ? undefined : parseStatusFilter,
      pipeline_status: pipelineStatusFilter === 'all' ? undefined : pipelineStatusFilter,
      page,
      per_page: 20,
      sort_by: 'created_at',
      sort_order: 'desc',
    }),
    [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, pipelineStatusFilter, page],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, cityFilter, sourceChannelFilter, parseStatusFilter, pipelineStatusFilter]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const totalCandidates = data?.total ?? candidates.length;
  const selectedJobId = targetJobId ? Number(targetJobId) : 0;
  const selectedJob = useMemo(
    () => (jobsAsync.data ?? []).find((job) => String(job.id) === targetJobId) ?? null,
    [jobsAsync.data, targetJobId],
  );
  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates]);
  const candidateIdKey = candidateIds.join(',');
  const matchPreviewAsync = useAsync(
    () => {
      if (!selectedJobId || candidateIds.length === 0) {
        return Promise.resolve({ job_id: selectedJobId, results: [] });
      }
      return api.previewJobMatch(selectedJobId, candidateIds);
    },
    [selectedJobId, candidateIdKey],
  );
  const matchByCandidateId = useMemo(() => {
    const map = new Map<number, MatchResultItem>();
    for (const item of matchPreviewAsync.data?.results ?? []) {
      map.set(item.candidate_id, item);
    }
    return map;
  }, [matchPreviewAsync.data]);

  const cityOptions = useMemo(() => {
    const parsedCities = candidates
      .map((candidate) => candidate.intent_city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set([...COMMON_CITY_OPTIONS, ...parsedCities]));
  }, [candidates]);

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

  const sourceOptions = useMemo(() => {
    const values = new Set<string>(COMMON_SOURCE_OPTIONS);
    if (sourceChannelFilter !== 'all') values.add(sourceChannelFilter);
    for (const candidate of candidates) {
      const channel = candidate.source?.channel?.trim();
      if (channel) values.add(channel);
    }
    return Array.from(values);
  }, [candidates, sourceChannelFilter]);

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minScore = Number(scoreFilter);
    return candidates
      .filter((candidate) => {
        const matchesQuery = !normalizedQuery || searchableText(candidate).includes(normalizedQuery);
        const matchesCity = cityFilter === 'all' || candidate.intent_city === cityFilter;
        const matchesTag =
          tagFilter === 'all' || candidateTags(candidate).some((skill) => skill.tag === tagFilter);
        const matchesScore = (candidate.max_score ?? 0) >= minScore;
        return matchesQuery && matchesCity && matchesTag && matchesScore;
      })
      .sort((a, b) => {
        if (selectedJobId) {
          const fitDiff = (matchByCandidateId.get(b.id)?.score ?? 0) - (matchByCandidateId.get(a.id)?.score ?? 0);
          if (fitDiff !== 0) return fitDiff;
        }
        const scoreDiff = (b.max_score ?? 0) - (a.max_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, cityFilter, matchByCandidateId, query, scoreFilter, selectedJobId, tagFilter]);

  const uniqueTagCount = tagOptions.length;
  const highScoreCount = candidates.filter((c) => (c.max_score ?? 0) >= 4).length;
  const hasActiveFilters =
    query.trim() !== '' ||
    cityFilter !== 'all' ||
    tagFilter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    parseStatusFilter !== 'all' ||
    pipelineStatusFilter !== 'all' ||
    scoreFilter !== '0';

  function resetFilters() {
    setQuery('');
    setCityFilter('all');
    setTagFilter('all');
    setSourceChannelFilter('all');
    setParseStatusFilter('all');
    setPipelineStatusFilter('all');
    setScoreFilter('0');
    setActionError(null);
    setActionMessage(null);
    setPage(1);
  }

  async function handleAddToJob(candidateId: number) {
    const jobId = Number(targetJobId);
    if (!targetJobId || Number.isNaN(jobId)) {
      setActionError('请先选择要加入的招聘需求');
      setActionMessage(null);
      return;
    }

    setAddingCandidateId(candidateId);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await api.batchAddToPipeline(jobId, [candidateId]);
      if (result.added > 0) {
        setActionMessage('已加入该需求流程，当前阶段为待筛选');
        reload();
      } else if (result.skipped_existing > 0) {
        setActionMessage('这位候选人已经在该需求流程中');
      } else {
        setActionMessage('未加入该需求流程，请刷新后重试');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '加入招聘需求失败');
    } finally {
      setAddingCandidateId(null);
    }
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
            已收录 <AnimatedNumber value={totalCandidates} /> 份简历
            {selectedJob ? (
              <> · 正在按「{selectedJob.title}」查看岗位适配</>
            ) : (
              <>
                {' '}· 当前页核心技能 <AnimatedNumber value={uniqueTagCount} /> 类
              </>
            )}
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
              <AnimatedNumber value={totalCandidates} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-muted-soft">高匹配候选人</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              <AnimatedNumber value={highScoreCount} />
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-4">
            <p className="text-xs text-muted-soft">{selectedJob ? '当前页匹配结果' : '可筛选技能'}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              <AnimatedNumber value={selectedJob ? matchByCandidateId.size : uniqueTagCount} />
            </p>
          </CardBody>
        </Card>
      </div>

      {candidates.length === 0 && !hasActiveFilters ? (
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  label="搜索简历"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="姓名、邮箱、公司、岗位、学校或技能"
                />
                <Select
                  label="意向城市"
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                >
                  <option value="all">全部城市</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </Select>
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
                  label="来源渠道"
                  value={sourceChannelFilter}
                  onChange={(event) => setSourceChannelFilter(event.target.value)}
                >
                  <option value="all">全部来源</option>
                  {sourceOptions.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </Select>
                <Select
                  label="解析状态"
                  value={parseStatusFilter}
                  onChange={(event) => setParseStatusFilter(event.target.value as 'all' | ParseStatus)}
                >
                  <option value="all">全部状态</option>
                  <option value="ok">解析成功</option>
                  <option value="failed">解析失败</option>
                  <option value="pending">待解析</option>
                  <option value="processing">解析中</option>
                </Select>
                <Select
                  label="入需求流程状态"
                  value={pipelineStatusFilter}
                  onChange={(event) =>
                    setPipelineStatusFilter(event.target.value as 'all' | 'in_pipeline' | 'not_in_pipeline')
                  }
                >
                  <option value="all">全部状态</option>
                    <option value="not_in_pipeline">未进入需求流程</option>
                    <option value="in_pipeline">已进入需求流程</option>
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
              <div className="mt-4 border-t border-hairline-soft pt-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)]">
                  <Select
                    label="目标岗位 / 加入招聘需求"
                    value={targetJobId}
                    onChange={(event) => {
                      setTargetJobId(event.target.value);
                      setActionError(null);
                      setActionMessage(null);
                    }}
                  >
                    <option value="">不限制岗位</option>
                    {(jobsAsync.data ?? []).map((job) => (
                      <option key={job.id} value={job.id}>
                        {[job.job_code, job.title, job.city, job.department].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-end">
                    <div className="w-full rounded-md border border-hairline bg-surface-soft px-3 py-2 text-xs text-muted">
                      {jobsAsync.loading ? (
                        <span>正在加载岗位…</span>
                      ) : jobsAsync.error ? (
                        <span className="text-danger-600">{jobsAsync.error.message}</span>
                      ) : targetJobId && matchPreviewAsync.loading ? (
                        <span>正在计算当前页候选人与该岗位的命中、欠缺和建议。</span>
                      ) : targetJobId && matchPreviewAsync.error ? (
                        <span className="text-danger-600">岗位匹配预览失败，仍可查看核心技能并加入该需求流程。</span>
                      ) : targetJobId ? (
                        <span>列表已切换为岗位匹配摘要；点击“加入该需求流程”才会推进候选人。</span>
                      ) : (
                        <span>先扫简历库；选择岗位后，再看每位候选人的命中、欠缺和推进建议。</span>
                      )}
                    </div>
                  </div>
                </div>
                {actionMessage && <p className="mt-2 text-xs text-success-700">{actionMessage}</p>}
                {actionError && <p className="mt-2 text-xs text-danger-600">{actionError}</p>}
              </div>
            </CardBody>
          </Card>

          <Card variant="elevated">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>候选人列表</CardTitle>
                <span className="text-xs text-muted-soft">
                  当前显示 {filteredCandidates.length} / {totalCandidates} 份
                </span>
              </div>
            </CardHeader>
            {filteredCandidates.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={Users}
                  title="没有符合条件的简历"
                  description="调整搜索词、城市、来源、解析状态、入需求流程状态或技能条件后再查看"
                />
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
	                  <thead>
	                    <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
	                      <th className="px-5 py-3">候选人</th>
	                      <th className="px-5 py-3">简历摘要</th>
	                      <th className="px-5 py-3">{targetJobId ? '岗位匹配摘要' : '核心技能'}</th>
	                      <th className="px-5 py-3">来源信息</th>
	                      <th className="px-5 py-3">最高分</th>
	                      <th className="px-5 py-3">入库时间</th>
	                      <th className="px-5 py-3 text-right">操作</th>
	                    </tr>
                  </thead>
                  <Reveal as="tbody" stagger={0.035} y={10}>
	                    {filteredCandidates.map((candidate) => (
	                      <CandidateRow
	                        key={candidate.id}
	                        candidate={candidate}
	                        targetJobId={targetJobId}
	                        jobFit={matchByCandidateId.get(candidate.id) ?? null}
	                        jobFitLoading={Boolean(targetJobId && matchPreviewAsync.loading)}
	                        jobFitError={Boolean(targetJobId && matchPreviewAsync.error)}
	                        addingCandidateId={addingCandidateId}
	                        onAddToJob={handleAddToJob}
	                      />
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
