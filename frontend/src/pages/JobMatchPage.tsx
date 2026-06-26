// 岗位匹配页 — 展示与当前岗位匹配的候选人排名及标签分析，并可一键将候选人加入招聘流程。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useDebounce } from '../lib/useDebounce';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SegmentedControl,
} from '../components/ui';
import type { CandidateListItem, MatchResultItem } from '../types';
import { Reveal, AnimatedNumber } from '../components/motion';

type MatchView = 'ai' | 'all';
type ScoreFilter = 'all' | 'strong' | 'medium' | 'low';
type PipelineFilter = 'all' | 'not_joined' | 'joined';

const ALL_OPTION = 'all';

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

function normalizedText(value: string) {
  return value.trim().toLowerCase();
}

function resultMatchesSearch(item: MatchResultItem, query: string) {
  const keyword = normalizedText(query);
  if (!keyword) return true;
  return [
    item.name_masked,
    ...item.matched_tags,
    ...item.missing_tags,
  ].some((value) => normalizedText(value).includes(keyword));
}

function resultMatchesScore(item: MatchResultItem, filter: ScoreFilter) {
  if (filter === 'strong') return item.score >= 0.8;
  if (filter === 'medium') return item.score >= 0.6;
  if (filter === 'low') return item.score < 0.6;
  return true;
}

function resultMatchesPipeline(item: MatchResultItem, filter: PipelineFilter, joinedCandidateIds: Set<number>) {
  if (filter === 'joined') return joinedCandidateIds.has(item.candidate_id);
  if (filter === 'not_joined') return !joinedCandidateIds.has(item.candidate_id);
  return true;
}

function resultMatchesTag(tags: string[], selectedTag: string) {
  return selectedTag === ALL_OPTION || tags.includes(selectedTag);
}

function collectUniqueTags(results: MatchResultItem[], field: 'matched_tags' | 'missing_tags') {
  return Array.from(new Set(results.flatMap((item) => item[field] ?? []))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function candidateToManualResult(candidate: CandidateListItem, preview: MatchResultItem | undefined): MatchResultItem {
  if (preview) return preview;
  return {
    candidate_id: candidate.id,
    name_masked: candidate.name_masked,
    score: 0,
    matched_tags: candidate.top_tags?.slice(0, 5).map((tag) => tag.tag) ?? [],
    missing_tags: [],
  };
}

// A single candidate match row.
function MatchRow({
  rank,
  item,
  jobId,
  joinState,
  onJoin,
  selected,
  onToggleSelect,
  disabled,
}: {
  rank: number;
  item: MatchResultItem;
  jobId: number;
  joinState: 'idle' | 'joining' | 'joined' | 'error';
  onJoin: (candidateId: number) => void;
  selected: boolean;
  onToggleSelect: (candidateId: number) => void;
  disabled: boolean;
}) {
  const matched = Array.isArray(item.matched_tags) ? item.matched_tags : [];
  const missing = Array.isArray(item.missing_tags) ? item.missing_tags : [];
  const canSelect = joinState !== 'joined' && !disabled;

  return (
    <tr className="border-b border-hairline-soft transition-colors hover:bg-surface-soft last:border-0">
      <td className="px-5 py-3.5 w-10">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSelect}
          onChange={() => onToggleSelect(item.candidate_id)}
          aria-label={`选择 ${item.name_masked}`}
          className="h-4 w-4 rounded border-hairline text-ink focus:ring-ink disabled:opacity-40"
        />
      </td>
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

      {/* Join pipeline action */}
      <td className="px-5 py-3.5 text-right">
        {joinState === 'joined' ? (
          <div className="flex items-center justify-end gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已加入流程
            </span>
            <Link
              to={`/pipeline?job=${jobId}&candidate=${item.candidate_id}`}
              aria-label="查看候选人流程"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-soft hover:border-surface-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              去候选人流程查看
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            loading={joinState === 'joining'}
            disabled={joinState === 'joining'}
            onClick={() => onJoin(item.candidate_id)}
          >
            {joinState === 'error' ? '重试加入' : '加入流程'}
          </Button>
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
  const pipelineAsync = useAsync(
    () =>
      isInvalidId
        ? Promise.resolve(null)
        : api.getPipelineBoard(jobId),
    [jobId, isInvalidId],
  );

  // Per-candidate "join pipeline" state, keyed by candidate id.
  const [joinStates, setJoinStates] = useState<
    Record<number, 'idle' | 'joining' | 'joined' | 'error'>
  >({});
  const [matchView, setMatchView] = useState<MatchView>('ai');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [pipelineFilter, setPipelineFilter] = useState<PipelineFilter>('all');
  const [matchedTagFilter, setMatchedTagFilter] = useState(ALL_OPTION);
  const [missingTagFilter, setMissingTagFilter] = useState(ALL_OPTION);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState<'idle' | 'adding' | 'done' | 'error'>('idle');
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const debouncedCandidateQuery = useDebounce(candidateQuery, 300);

  const existingPipelineIds = useMemo(
    () => new Set((pipelineAsync.data?.candidates ?? []).map((c) => c.candidate_id)),
    [pipelineAsync.data],
  );
  const sortedResults = useMemo(
    () => [...(data?.results ?? [])].sort((a, b) => b.score - a.score),
    [data],
  );
  const libraryAsync = useAsync(
    () => {
      if (isInvalidId || matchView !== 'all') {
        return Promise.resolve({ candidates: [], total: 0, page: 1, per_page: 50, pages: 1 });
      }
      return api.searchCandidates({
        search: debouncedCandidateQuery || undefined,
        page: 1,
        per_page: 50,
        sort_by: 'created_at',
        sort_order: 'desc',
      });
    },
    [isInvalidId, matchView, debouncedCandidateQuery],
  );
  const manualCandidateIds = useMemo(
    () => (libraryAsync.data?.candidates ?? []).map((candidate) => candidate.id),
    [libraryAsync.data],
  );
  const manualCandidateIdKey = manualCandidateIds.join(',');
  const manualPreviewAsync = useAsync(
    () => {
      if (isInvalidId || matchView !== 'all' || manualCandidateIds.length === 0) {
        return Promise.resolve({ job_id: jobId, results: [] });
      }
      return api.previewJobMatch(jobId, manualCandidateIds);
    },
    [isInvalidId, jobId, matchView, manualCandidateIdKey],
  );
  const manualPreviewByCandidateId = useMemo(() => {
    const map = new Map<number, MatchResultItem>();
    for (const item of manualPreviewAsync.data?.results ?? []) {
      map.set(item.candidate_id, item);
    }
    return map;
  }, [manualPreviewAsync.data]);
  const manualResults = useMemo(
    () =>
      (libraryAsync.data?.candidates ?? [])
        .map((candidate) => candidateToManualResult(candidate, manualPreviewByCandidateId.get(candidate.id)))
        .sort((a, b) => b.score - a.score),
    [libraryAsync.data, manualPreviewByCandidateId],
  );
  const joinedCandidateIds = useMemo(() => {
    const ids = new Set(existingPipelineIds);
    Object.entries(joinStates).forEach(([candidateId, state]) => {
      if (state === 'joined') ids.add(Number(candidateId));
    });
    return ids;
  }, [existingPipelineIds, joinStates]);
  const baseResults = matchView === 'ai' ? sortedResults : manualResults;
  const matchedTagOptions = useMemo(() => collectUniqueTags(baseResults, 'matched_tags'), [baseResults]);
  const missingTagOptions = useMemo(() => collectUniqueTags(baseResults, 'missing_tags'), [baseResults]);
  const filteredResults = useMemo(
    () =>
      baseResults.filter((item) => {
        const matchesSearch = matchView === 'all' || resultMatchesSearch(item, debouncedCandidateQuery);
        return (
          matchesSearch &&
          resultMatchesScore(item, scoreFilter) &&
          resultMatchesPipeline(item, pipelineFilter, joinedCandidateIds) &&
          resultMatchesTag(item.matched_tags, matchedTagFilter) &&
          resultMatchesTag(item.missing_tags, missingTagFilter)
        );
      }),
    [
      baseResults,
      debouncedCandidateQuery,
      joinedCandidateIds,
      matchView,
      matchedTagFilter,
      missingTagFilter,
      pipelineFilter,
      scoreFilter,
    ],
  );
  const selectableResults = useMemo(
    () => filteredResults.filter((item) => !joinedCandidateIds.has(item.candidate_id)),
    [filteredResults, joinedCandidateIds],
  );
  const allSelected =
    selectableResults.length > 0 &&
    selectableResults.every((item) => selectedIds.has(item.candidate_id));
  const someSelected = selectedIds.size > 0;
  const filteredResultKey = filteredResults.map((item) => item.candidate_id).join(',');
  const joinedCandidateKey = Array.from(joinedCandidateIds).sort((a, b) => a - b).join(',');

  useEffect(() => {
    const visibleIds = new Set(filteredResults.map((item) => item.candidate_id));
    setSelectedIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((candidateId) => visibleIds.has(candidateId) && !joinedCandidateIds.has(candidateId)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [filteredResultKey, filteredResults, joinedCandidateIds, joinedCandidateKey]);

  const toggleSelect = useCallback((candidateId: number) => {
    if (joinedCandidateIds.has(candidateId)) return;
    setBatchStatus('idle');
    setBatchMessage(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }, [joinedCandidateIds]);

  const toggleSelectAll = useCallback(() => {
    setBatchStatus('idle');
    setBatchMessage(null);
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(selectableResults.map((item) => item.candidate_id));
    });
  }, [allSelected, selectableResults]);

  function resetFilters() {
    setCandidateQuery('');
    setScoreFilter('all');
    setPipelineFilter('all');
    setMatchedTagFilter(ALL_OPTION);
    setMissingTagFilter(ALL_OPTION);
    setBatchStatus('idle');
    setBatchMessage(null);
    setSelectedIds(new Set());
  }

  async function handleJoin(candidateId: number) {
    setJoinStates((prev) => ({ ...prev, [candidateId]: 'joining' }));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
    try {
      await api.movePipeline({
        candidate_id: candidateId,
        job_id: jobId,
        stage: 'pending',
      });
      setJoinStates((prev) => ({ ...prev, [candidateId]: 'joined' }));
      void pipelineAsync.reload();
    } catch {
      setJoinStates((prev) => ({ ...prev, [candidateId]: 'error' }));
    }
  }

  async function handleBatchAdd() {
    const ids = Array.from(selectedIds).filter((candidateId) => !joinedCandidateIds.has(candidateId));
    if (ids.length === 0) return;
    setBatchStatus('adding');
    setBatchMessage(null);
    try {
      const result = await api.batchAddToPipeline(jobId, ids);
      setJoinStates((prev) => {
        const next = { ...prev };
        ids.forEach((candidateId) => {
          next[candidateId] = 'joined';
        });
        return next;
      });
      setSelectedIds(new Set());
      setBatchStatus('done');
      setBatchMessage(`成功加入 ${result.added} 位，已存在 ${result.skipped_existing} 位`);
      void pipelineAsync.reload();
    } catch (err) {
      setBatchStatus('error');
      setBatchMessage(err instanceof Error ? err.message : '批量加入失败');
    }
  }

  // Invalid id guard — after all hooks
  if (isInvalidId) {
    return (
      <div>
        <Link
          to="/jobs"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-body"
        >
          ← 返回岗位画像
        </Link>
        <div className="mt-4">
          <ErrorState message="无效的岗位 ID" />
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
            岗位画像
          </Link>
          <span className="text-muted-soft">›</span>
          <span className="text-ink">匹配候选人</span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 font-display text-2xl text-ink">
              候选人匹配
            </h1>
            <p className="text-sm text-muted">岗位 ID：{jobId} · AI 先推荐，也可以人工搜索全库候选人</p>
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
        <ErrorState message={error.message} onRetry={reload} />
      )}

      {/* Results */}
      {!loading && !error && data && (() => {
        const results = filteredResults;
        const totalResults = matchView === 'ai' ? sortedResults.length : (libraryAsync.data?.total ?? manualResults.length);
        const isManualLoading = matchView === 'all' && (libraryAsync.loading || manualPreviewAsync.loading);
        const manualError = matchView === 'all' ? libraryAsync.error ?? manualPreviewAsync.error : null;

        return (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle>匹配结果</CardTitle>
                  <SegmentedControl<MatchView>
                    size="sm"
                    value={matchView}
                    onChange={(value) => {
                      setMatchView(value);
                      setSelectedIds(new Set());
                      setBatchStatus('idle');
                      setBatchMessage(null);
                    }}
                    options={[
                      { value: 'ai', label: 'AI 推荐' },
                      { value: 'all', label: '全部候选人' },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {batchMessage && (
                    <span
                      className={
                        batchStatus === 'error'
                          ? 'text-xs font-medium text-danger-600'
                          : 'text-xs font-medium text-success-600'
                      }
                    >
                      {batchMessage}
                    </span>
                  )}
                  {someSelected && (
                    <span className="text-xs text-muted-soft">已选 {selectedIds.size} 位</span>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!someSelected || batchStatus === 'adding'}
                    loading={batchStatus === 'adding'}
                    onClick={handleBatchAdd}
                  >
                    批量加入流程
                  </Button>
                  <span className="text-xs text-muted-soft">
                    当前显示 {results.length} / {totalResults} 位候选人
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardBody className="border-t border-hairline-soft">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  label="搜索候选人"
                  value={candidateQuery}
                  onChange={(event) => {
                    setCandidateQuery(event.target.value);
                    setSelectedIds(new Set());
                  }}
                  placeholder="姓名、公司、岗位、学校、技能或邮箱"
                />
                <Select
                  label="匹配度"
                  value={scoreFilter}
                  onChange={(event) => setScoreFilter(event.target.value as ScoreFilter)}
                >
                  <option value="all">全部匹配度</option>
                  <option value="strong">80% 以上</option>
                  <option value="medium">60% 以上</option>
                  <option value="low">低于 60%</option>
                </Select>
                <Select
                  label="入流程状态"
                  value={pipelineFilter}
                  onChange={(event) => setPipelineFilter(event.target.value as PipelineFilter)}
                >
                  <option value="all">全部状态</option>
                  <option value="not_joined">未加入流程</option>
                  <option value="joined">已加入流程</option>
                </Select>
                <Select
                  label="匹配技能"
                  value={matchedTagFilter}
                  onChange={(event) => setMatchedTagFilter(event.target.value)}
                >
                  <option value={ALL_OPTION}>全部匹配技能</option>
                  {matchedTagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </Select>
                <Select
                  label="缺失技能"
                  value={missingTagFilter}
                  onChange={(event) => setMissingTagFilter(event.target.value)}
                >
                  <option value={ALL_OPTION}>全部缺失技能</option>
                  {missingTagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline-soft pt-3">
                <p className="text-xs text-muted">
                  {matchView === 'ai'
                    ? 'AI 推荐按综合匹配度排序；如果目标人没排上来，切到“全部候选人”按姓名或技能人工补找。'
                    : '人工补找会从全量简历库检索；即使 AI 原本没推荐，也可以查看匹配预览并手动加入流程。'}
                </p>
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  重置筛选
                </Button>
              </div>
              {manualError && (
                <p className="mt-2 text-xs font-medium text-danger-600">
                  {manualError.message}
                </p>
              )}
            </CardBody>
            {isManualLoading ? (
              <CardBody className="flex flex-col items-center justify-center gap-3 border-t border-hairline-soft py-16 text-center">
                <Spinner size="md" />
                <p className="text-sm text-muted">正在搜索候选人并计算岗位匹配…</p>
              </CardBody>
            ) : results.length === 0 ? (
              <CardBody className="border-t border-hairline-soft">
                <EmptyState
                  icon={Users}
                  title={matchView === 'ai' ? 'AI 暂无符合条件的推荐' : '没有找到候选人'}
                  description={
                    matchView === 'ai'
                      ? '可以放宽匹配度、清空技能筛选，或切到“全部候选人”按姓名人工搜索'
                      : '换一个姓名、邮箱或技能关键词再搜；确认要找的人是否已经上传到简历库'
                  }
                />
              </CardBody>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline-soft bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableResults.length === 0 || batchStatus === 'adding'}
                        onChange={toggleSelectAll}
                        aria-label="选择全部未加入候选人"
                        className="h-4 w-4 rounded border-hairline text-ink focus:ring-ink disabled:opacity-40"
                      />
                    </th>
                    <th className="px-5 py-3 w-10">排名</th>
                    <th className="px-5 py-3">候选人</th>
                    <th className="px-5 py-3">匹配度</th>
                    <th className="px-5 py-3">匹配技能</th>
                    <th className="px-5 py-3">欠缺技能</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <Reveal as="tbody" stagger={0.05} y={12}>
                  {results.map((item, i) => (
                    <MatchRow
                      key={item.candidate_id}
                      rank={i + 1}
                      item={item}
                      jobId={jobId}
                      joinState={
                        joinStates[item.candidate_id] ??
                        (existingPipelineIds.has(item.candidate_id) ? 'joined' : 'idle')
                      }
                      onJoin={handleJoin}
                      selected={selectedIds.has(item.candidate_id)}
                      onToggleSelect={toggleSelect}
                      disabled={batchStatus === 'adding'}
                    />
                  ))}
                </Reveal>
              </table>
            </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}
