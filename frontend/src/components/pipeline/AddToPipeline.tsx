// "加入需求流程"面板：把简历库里尚未进入本需求流程的候选人加入到「待筛选」阶段。
// 解决候选人无法进入招聘流程的缺口。

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Spinner, Select } from '../ui';
import type { PipelineStage } from '../../types';

interface AddToPipelineProps {
  jobId: number;
  // 已在本需求流程中的候选人 id，用于从可选列表里排除。
  existingIds: Set<number>;
  onAdded: () => void;
  onClose?: () => void;
}

export function AddToPipeline({ jobId, existingIds, onAdded, onClose }: AddToPipelineProps) {
  const candidatesAsync = useAsync(() => api.listCandidates(), []);
  const [candidateId, setCandidateId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 仅展示尚未进入本需求流程的候选人。
  const available = useMemo(
    () => (candidatesAsync.data ?? []).filter((c) => !existingIds.has(c.id)),
    [candidatesAsync.data, existingIds],
  );
  const hasCandidatesInLibrary = (candidatesAsync.data ?? []).length > 0;

  async function handleAdd() {
    const cid = Number(candidateId);
    if (!candidateId || Number.isNaN(cid)) {
      setError('请选择候选人');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.movePipeline({
        candidate_id: cid,
        job_id: jobId,
        stage: 'pending' as PipelineStage,
      });
      setCandidateId('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-surface-soft px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <UserPlus className="h-4 w-4 text-muted" />
          加入候选人到该需求流程
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="关闭加入候选人面板"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {candidatesAsync.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载候选人…
        </div>
      ) : candidatesAsync.error ? (
        <p className="text-sm text-danger-600">{candidatesAsync.error.message}</p>
      ) : available.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-soft">
            {hasCandidatesInLibrary
              ? '简历库中的候选人都已在本需求流程中。'
              : '暂无可加入候选人，请先上传简历。'}
          </p>
          {!hasCandidatesInLibrary && (
            <Link to="/upload">
              <Button variant="secondary" size="sm">
                上传简历
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              aria-label="选择候选人"
              value={candidateId}
              onChange={(e) => {
                setCandidateId(e.target.value);
                setError(null);
              }}
            >
              <option value="">— 选择候选人 —</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_masked} (ID {c.id})
                </option>
              ))}
            </Select>
            <Link to="/upload" className="mt-1 inline-flex text-xs font-semibold text-ink hover:underline">
              没有目标候选人？上传简历
            </Link>
          </div>
          <Button
            onClick={handleAdd}
            loading={adding}
            disabled={!candidateId || adding}
            size="sm"
          >
            加入该需求流程
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
    </div>
  );
}
