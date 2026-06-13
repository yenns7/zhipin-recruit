// 招聘流程看板页 — 按岗位展示各阶段候选人数量，并提供"推进候选人"操作面板。

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
} from '../components/ui';
import type { PipelineCounts, PipelineStage } from '../types';
import { Reveal, AnimatedNumber } from '../components/motion';

// ---- Stage config ----

interface StageConfig {
  key: PipelineStage;
  label: string;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
}

const STAGES: StageConfig[] = [
  {
    key: 'pending',
    label: '待筛选',
    bg: 'bg-surface-soft',
    border: 'border-hairline',
    text: 'text-body',
    badgeBg: 'bg-surface-strong text-body',
  },
  {
    key: 'ai_screen',
    label: 'AI 初筛',
    bg: 'bg-brand-50',
    border: 'border-hairline',
    text: 'text-brand-700',
    badgeBg: 'bg-brand-100 text-brand-700',
  },
  {
    key: 'interview',
    label: '面试',
    bg: 'bg-warning-50',
    border: 'border-warning-200',
    text: 'text-warning-700',
    badgeBg: 'bg-warning-100 text-warning-700',
  },
  {
    key: 'offer',
    label: 'Offer',
    bg: 'bg-success-50',
    border: 'border-success-200',
    text: 'text-success-700',
    badgeBg: 'bg-success-100 text-success-700',
  },
  {
    key: 'onboarded',
    label: '已入职',
    bg: 'bg-success-50',
    border: 'border-success-300',
    text: 'text-success-800',
    badgeBg: 'bg-success-200 text-success-800',
  },
  {
    key: 'rejected',
    label: '淘汰',
    bg: 'bg-danger-50',
    border: 'border-danger-200',
    text: 'text-danger-700',
    badgeBg: 'bg-danger-100 text-danger-700',
  },
];

// ---- Kanban column ----

function KanbanColumn({
  stage,
  count,
}: {
  stage: StageConfig;
  count: number;
}) {
  return (
    <div
      className={`flex min-h-[180px] flex-col rounded-xl border ${stage.border} ${stage.bg} px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-sm font-semibold ${stage.text}`}>
          {stage.label}
        </span>
        {/* Plain span — Badge px-2.5 conflicts if we pass size overrides */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${stage.badgeBg}`}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-ink">
          {count > 0 ? <AnimatedNumber value={count} /> : '—'}
        </span>
      </div>
    </div>
  );
}

// ---- Move panel ----

interface MovePanelProps {
  jobId: number;
  onSuccess: () => void;
}

function MovePanel({ jobId, onSuccess }: MovePanelProps) {
  const candidatesAsync = useAsync(() => api.listCandidates(), []);
  const [candidateId, setCandidateId] = useState('');
  const [stage, setStage] = useState<PipelineStage>('ai_screen');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleMove() {
    const cid = Number(candidateId);
    if (!candidateId || Number.isNaN(cid)) {
      setMoveError('请选择候选人');
      return;
    }
    setMoving(true);
    setMoveError(null);
    setSuccessMsg(null);
    try {
      await api.movePipeline({ candidate_id: cid, job_id: jobId, stage });
      const stageLabel = STAGES.find((s) => s.key === stage)?.label ?? stage;
      setSuccessMsg(`已推进至「${stageLabel}」阶段`);
      setCandidateId('');
      onSuccess();
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setMoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>推进候选人</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* Candidate selector */}
          <div>
            <label
              htmlFor="move-candidate"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              候选人
            </label>
            {candidatesAsync.loading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted">
                <Spinner size="sm" />
                加载候选人列表…
              </div>
            ) : candidatesAsync.error ? (
              <p className="text-sm text-danger-600">
                {candidatesAsync.error.message}
              </p>
            ) : (
              <select
                id="move-candidate"
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                value={candidateId}
                onChange={(e) => {
                  setCandidateId(e.target.value);
                  setMoveError(null);
                  setSuccessMsg(null);
                }}
              >
                <option value="">— 请选择候选人 —</option>
                {(candidatesAsync.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_masked} (ID {c.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Stage selector */}
          <div>
            <label
              htmlFor="move-stage"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              目标阶段
            </label>
            <select
              id="move-stage"
              className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              value={stage}
              onChange={(e) => {
                setStage(e.target.value as PipelineStage);
                setMoveError(null);
                setSuccessMsg(null);
              }}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Error / success */}
          {moveError && (
            <p className="text-sm text-danger-600">{moveError}</p>
          )}
          {successMsg && (
            <p className="text-sm text-success-600">{successMsg}</p>
          )}

          <Button
            onClick={handleMove}
            loading={moving}
            disabled={!candidateId || moving}
            className="w-full"
          >
            确认推进
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---- Page ----

export function PipelinePage() {
  const jobsAsync = useAsync(() => api.listJobs(), []);

  // selectedJobId may be null while jobs are loading; we default to first job
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  // Compute the effective job id: user pick → first available → null
  const effectiveJobId =
    selectedJobId ??
    (jobsAsync.data && jobsAsync.data.length > 0
      ? jobsAsync.data[0].id
      : null);

  const pipelineAsync = useAsync(
    () =>
      effectiveJobId !== null
        ? api.getPipeline(effectiveJobId)
        : Promise.resolve({} as PipelineCounts),
    [effectiveJobId]
  );

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl text-ink">
          招聘流程
        </h1>
        <p className="mt-1 text-sm text-muted">
          按阶段查看各岗位候选人分布，并手动推进候选人至下一阶段
        </p>
      </div>

      {/* Job selector */}
      {jobsAsync.loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载岗位列表…
        </div>
      )}

      {!jobsAsync.loading && jobsAsync.error && (
        <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {jobsAsync.error.message}
          <button
            onClick={jobsAsync.reload}
            className="ml-3 font-medium underline hover:no-underline"
          >
            重试
          </button>
        </div>
      )}

      {!jobsAsync.loading && !jobsAsync.error && jobsAsync.data?.length === 0 && (
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
              <rect x="6" y="10" width="36" height="28" rx="3" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 10V8a2 2 0 012-2h12a2 2 0 012 2v2" />
            </svg>
            <p className="text-sm font-medium text-muted">暂无岗位</p>
            <p className="mt-1 text-xs text-muted-soft">请先在「岗位管理」创建岗位，再查看招聘流程</p>
            <div className="mt-4">
              <Link to="/jobs">
                <Button variant="secondary" size="sm">
                  前往创建岗位
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {!jobsAsync.loading && !jobsAsync.error && (jobsAsync.data?.length ?? 0) > 0 && (
        <>
          {/* Job picker */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="job-select"
              className="text-sm font-medium text-ink"
            >
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
            {pipelineAsync.loading && <Spinner size="sm" />}
          </div>

          {/* Pipeline error */}
          {!pipelineAsync.loading && pipelineAsync.error && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {pipelineAsync.error.message}
              <button
                onClick={pipelineAsync.reload}
                className="ml-3 font-medium underline hover:no-underline"
              >
                重试
              </button>
            </div>
          )}

          {/* Kanban board */}
          {!pipelineAsync.loading && !pipelineAsync.error && (
            <Reveal as="div" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" stagger={0.06}>
              {STAGES.map((s) => (
                <KanbanColumn
                  key={s.key}
                  stage={s}
                  count={pipelineAsync.data?.[s.key] ?? 0}
                />
              ))}
            </Reveal>
          )}

          {/* Move panel */}
          {effectiveJobId !== null && (
            <div className="max-w-sm">
              <MovePanel
                jobId={effectiveJobId}
                onSuccess={pipelineAsync.reload}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
