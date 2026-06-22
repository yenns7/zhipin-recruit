// 候选人管道页 — 按岗位查看每位候选人的当前阶段，
// 并支持在右侧详情中推进、淘汰、跳转阶段与加入新候选人。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KanbanSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  PageHeader,
  Card,
  useToast,
} from '../components/ui';
import type {
  CandidateDispositionInput,
  JobListItem,
  PipelineStage,
  PipelineBoardCandidate,
} from '../types';
import { STAGES, stageLabel } from '../lib/pipelineStages';
import { AddToPipeline } from '../components/pipeline/AddToPipeline';
import { PipelineStageTabs } from '../components/pipeline/PipelineStageTabs';
import { PipelineCandidateList } from '../components/pipeline/PipelineCandidateList';
import { PipelineCandidatePanel } from '../components/pipeline/PipelineCandidatePanel';

function formatJobOption(job: JobListItem) {
  const code = job.job_code || `JOB-${job.id}`;
  return [code, job.title, job.city, job.department].filter(Boolean).join(' · ');
}

interface PendingMove {
  candidateId: number;
  toStage: PipelineStage;
}

export function PipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const jobParam = Number(searchParams.get('job'));
  const candidateParam = Number(searchParams.get('candidate'));
  const requestedJobId = Number.isFinite(jobParam) && jobParam > 0 ? jobParam : null;
  const highlightedCandidateId =
    Number.isFinite(candidateParam) && candidateParam > 0 ? candidateParam : null;

  const jobsAsync = useAsync(() => api.listJobs(), []);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(requestedJobId);

  const effectiveJobId =
    selectedJobId ??
    (jobsAsync.data && jobsAsync.data.length > 0 ? jobsAsync.data[0].id : null);

  const boardAsync = useAsync(
    () =>
      effectiveJobId !== null
        ? api.getPipelineBoard(effectiveJobId)
        : Promise.resolve(null),
      [effectiveJobId],
  );

  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStage>('pending');
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(
    highlightedCandidateId,
  );
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [recentlyMovedCandidateId, setRecentlyMovedCandidateId] = useState<number | null>(null);

  const candidates: PipelineBoardCandidate[] = useMemo(
    () => boardAsync.data?.candidates ?? [],
    [boardAsync.data],
  );
  const highlightedCandidate = highlightedCandidateId
    ? candidates.find((c) => c.candidate_id === highlightedCandidateId)
    : null;
  const listHighlightCandidateId = recentlyMovedCandidateId ?? highlightedCandidateId;

  useEffect(() => {
    setSelectedJobId(requestedJobId);
    setPendingMove(null);
    setRecentlyMovedCandidateId(null);
  }, [requestedJobId]);

  // 已在本岗位流程中的候选人 id 集合（供"加入流程"排除）。
  const existingIds = useMemo(
    () => new Set(candidates.map((c) => c.candidate_id)),
    [candidates],
  );

  // 按阶段分桶。
  const byStage = useMemo(() => {
    const map: Partial<Record<PipelineStage, PipelineBoardCandidate[]>> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const c of candidates) {
      (map[c.stage] ??= []).push(c);
    }
    return map;
  }, [candidates]);

  const stageCounts = useMemo(
    () =>
      STAGES.reduce<Partial<Record<PipelineStage, number>>>((acc, stage) => {
        acc[stage.key] = byStage[stage.key]?.length ?? 0;
        return acc;
      }, {}),
    [byStage],
  );
  const activeStageConfig = STAGES.find((stage) => stage.key === activeStage) ?? STAGES[0];
  const activeCandidates = useMemo(
    () => byStage[activeStage] ?? [],
    [activeStage, byStage],
  );
  const selectedCandidate =
    candidates.find((candidate) => candidate.candidate_id === selectedCandidateId) ?? null;

  useEffect(() => {
    if (highlightedCandidate) {
      setActiveStage(highlightedCandidate.stage);
      setSelectedCandidateId(highlightedCandidate.candidate_id);
    }
  }, [highlightedCandidate]);

  useEffect(() => {
    if (!pendingMove) return;
    const movedCandidate = candidates.find(
      (candidate) =>
        candidate.candidate_id === pendingMove.candidateId &&
        candidate.stage === pendingMove.toStage,
    );
    if (!movedCandidate) return;
    setActiveStage(pendingMove.toStage);
    setSelectedCandidateId(pendingMove.candidateId);
    setRecentlyMovedCandidateId(pendingMove.candidateId);
    setPendingMove(null);
    setBusyId(null);
  }, [candidates, pendingMove]);

  useEffect(() => {
    if (!recentlyMovedCandidateId) return;
    const timer = window.setTimeout(() => {
      setRecentlyMovedCandidateId((current) =>
        current === recentlyMovedCandidateId ? null : current,
      );
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [recentlyMovedCandidateId]);

  useEffect(() => {
    if (!pendingMove || boardAsync.loading || !boardAsync.error) return;
    setPendingMove(null);
    setBusyId(null);
  }, [boardAsync.error, boardAsync.loading, pendingMove]);

  useEffect(() => {
    if (pendingMove) {
      return;
    }
    if (activeCandidates.length === 0) {
      setSelectedCandidateId(null);
      return;
    }
    if (
      selectedCandidateId === null ||
      !activeCandidates.some((candidate) => candidate.candidate_id === selectedCandidateId)
    ) {
      setSelectedCandidateId(activeCandidates[0].candidate_id);
    }
  }, [activeCandidates, pendingMove, selectedCandidateId]);

  const handleMove = useCallback(
    async (
      candidateId: number,
      toStage: PipelineStage,
      note?: string,
      disposition?: CandidateDispositionInput,
    ) => {
      if (effectiveJobId === null) return;
      setBusyId(candidateId);
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      try {
        const res = await api.movePipeline({
          candidate_id: candidateId,
          job_id: effectiveJobId,
          stage: toStage,
          note,
          disposition,
        });
        setPendingMove({ candidateId, toStage });
        toast.success(`${res.name_masked || '候选人'} 已更新至「${stageLabel(toStage)}」`);
        boardAsync.reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '操作失败');
        setBusyId(null);
      }
    },
    [effectiveJobId, boardAsync, toast],
  );

  const handleJobChange = useCallback(
    (jobId: number) => {
      setSelectedJobId(jobId);
      setSearchParams({ job: String(jobId) });
      setPendingMove(null);
      setRecentlyMovedCandidateId(null);
      setActiveStage('pending');
      setSelectedCandidateId(null);
    },
    [setSearchParams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="候选人管道"
        description="以看板查看每位候选人所处阶段，并就地推进、淘汰或调整其状态"
      />

      <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3 text-sm text-muted">
        待筛选 → AI 初筛 → 业务反馈 → 面试中 → Offer → 已入职 / 淘汰沉淀
      </div>

      {jobsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载岗位列表…
        </div>
      )}

      {!jobsAsync.loading && jobsAsync.error && (
        <ErrorState message={jobsAsync.error.message} onRetry={jobsAsync.reload} />
      )}

      {!jobsAsync.loading && !jobsAsync.error && jobsAsync.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={KanbanSquare}
            title="暂无岗位"
            description="请先创建岗位画像，再查看候选人管道"
            action={
              <Link to="/jobs">
                <Button variant="secondary" size="sm">
                  前往岗位画像
                </Button>
              </Link>
            }
          />
        </Card>
      )}

      {!jobsAsync.loading && !jobsAsync.error && (jobsAsync.data?.length ?? 0) > 0 && (
        <>
          {/* 岗位选择 + 匹配入口 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label htmlFor="job-select" className="text-sm font-medium text-ink">
                当前岗位
              </label>
              <select
                id="job-select"
                className="h-10 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                value={effectiveJobId ?? ''}
                onChange={(e) => handleJobChange(Number(e.target.value))}
              >
                {(jobsAsync.data ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {formatJobOption(j)}
                  </option>
                ))}
              </select>
              {boardAsync.loading && <Spinner size="sm" />}
            </div>

            {effectiveJobId !== null && (
              <Link
                to={`/jobs/${effectiveJobId}/match`}
                className="text-sm font-medium text-muted hover:text-ink hover:underline"
              >
                去匹配更多候选人 →
              </Link>
            )}
          </div>

          {/* 加入候选人到流程 */}
          {effectiveJobId !== null && (
            <AddToPipeline
              jobId={effectiveJobId}
              existingIds={existingIds}
              onAdded={boardAsync.reload}
            />
          )}

          {highlightedCandidate && (
            <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
              已定位到 {highlightedCandidate.name_masked}。下一步可在右侧详情推进主流程，
              面试轮次和反馈请进入「面试工作台」记录。
            </div>
          )}

          {/* 候选人管道工作区 */}
          {!boardAsync.loading && boardAsync.error && (
            <ErrorState message={boardAsync.error.message} onRetry={boardAsync.reload} />
          )}

          {!boardAsync.error && (
            <div className="space-y-4">
              <PipelineStageTabs
                stages={STAGES}
                activeStage={activeStage}
                counts={stageCounts}
                onSelect={(stage) => {
                  setActiveStage(stage);
                  setSelectedCandidateId(byStage[stage]?.[0]?.candidate_id ?? null);
                }}
              />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <PipelineCandidateList
                  stage={activeStageConfig}
                  candidates={activeCandidates}
                  selectedCandidateId={selectedCandidateId}
                  highlightedCandidateId={listHighlightCandidateId}
                  busyId={busyId}
                  onSelect={(candidate) => setSelectedCandidateId(candidate.candidate_id)}
                />
                {effectiveJobId !== null && (
                  <PipelineCandidatePanel
                    candidate={selectedCandidate}
                    jobId={effectiveJobId}
                    busy={
                      selectedCandidate
                        ? busyId === selectedCandidate.candidate_id ||
                          pendingMove?.candidateId === selectedCandidate.candidate_id
                        : false
                    }
                    onMove={handleMove}
                  />
                )}
              </div>
            </div>
          )}

          {/* 空流程提示 */}
          {!boardAsync.loading && !boardAsync.error && candidates.length === 0 && (
            <p className="text-center text-sm text-muted-soft">
              本岗位流程中暂无候选人，先从上方「加入候选人到流程」开始。
            </p>
          )}
        </>
      )}
    </div>
  );
}
