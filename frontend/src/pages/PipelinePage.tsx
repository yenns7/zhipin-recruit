// 招聘流程看板页 — 按岗位以看板形式展示每位候选人的当前阶段，
// 并支持就地变更候选人状态（推进 / 淘汰 / 跳转任意阶段）与加入新候选人。

import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
} from '../components/ui';
import type { PipelineStage, PipelineBoardCandidate } from '../types';
import { STAGES, stageLabel } from '../lib/pipelineStages';
import { KanbanColumn } from '../components/pipeline/KanbanColumn';
import { AddToPipeline } from '../components/pipeline/AddToPipeline';
import { Reveal } from '../components/motion';

export function PipelinePage() {
  const jobsAsync = useAsync(() => api.listJobs(), []);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

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

  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const candidates: PipelineBoardCandidate[] = boardAsync.data?.candidates ?? [];

  // 已在本岗位流程中的候选人 id 集合（供"加入流程"排除）。
  const existingIds = useMemo(
    () => new Set(candidates.map((c) => c.candidate_id)),
    [candidates],
  );

  // 按阶段分桶。
  const byStage = useMemo(() => {
    const map: Record<string, PipelineBoardCandidate[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const c of candidates) {
      (map[c.stage] ??= []).push(c);
    }
    return map;
  }, [candidates]);

  const handleMove = useCallback(
    async (candidateId: number, toStage: PipelineStage) => {
      if (effectiveJobId === null) return;
      setBusyId(candidateId);
      setToast(null);
      try {
        const res = await api.movePipeline({
          candidate_id: candidateId,
          job_id: effectiveJobId,
          stage: toStage,
        });
        setToast(`${res.name_masked || '候选人'} 已更新至「${stageLabel(toStage)}」`);
        await boardAsync.reload();
      } catch (err) {
        setToast(err instanceof Error ? err.message : '操作失败');
      } finally {
        setBusyId(null);
      }
    },
    [effectiveJobId, boardAsync],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="招聘流程"
        description="以看板查看每位候选人所处阶段，并就地推进、淘汰或调整其状态"
      />

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
            description="请先在「岗位管理」创建岗位，再查看招聘流程"
            action={
              <Link to="/jobs">
                <Button variant="secondary" size="sm">
                  前往创建岗位
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
                onChange={(e) => setSelectedJobId(Number(e.target.value))}
              >
                {(jobsAsync.data ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
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

          {/* Toast 反馈 */}
          {toast && (
            <div className="rounded-md border border-hairline bg-surface-soft px-4 py-2 text-sm text-body">
              {toast}
            </div>
          )}

          {/* 看板 */}
          {!boardAsync.loading && boardAsync.error && (
            <ErrorState message={boardAsync.error.message} onRetry={boardAsync.reload} />
          )}

          {!boardAsync.error && (
            <Reveal
              as="div"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              stagger={0.06}
            >
              {STAGES.map((s) => (
                <KanbanColumn
                  key={s.key}
                  stage={s}
                  candidates={byStage[s.key] ?? []}
                  busyId={busyId}
                  onMove={handleMove}
                />
              ))}
            </Reveal>
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
