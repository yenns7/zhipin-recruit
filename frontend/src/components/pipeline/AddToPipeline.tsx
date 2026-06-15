// "加入流程"面板：把简历库里尚未进入本岗位流程的候选人加入到「待筛选」阶段。
// 解决候选人无法进入招聘流程的缺口。

import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Spinner, Select } from '../ui';
import type { PipelineStage } from '../../types';

interface AddToPipelineProps {
  jobId: number;
  // 已在本岗位流程中的候选人 id，用于从可选列表里排除。
  existingIds: Set<number>;
  onAdded: () => void;
}

export function AddToPipeline({ jobId, existingIds, onAdded }: AddToPipelineProps) {
  const candidatesAsync = useAsync(() => api.listCandidates(), []);
  const [candidateId, setCandidateId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 仅展示尚未进入本岗位流程的候选人。
  const available = useMemo(
    () => (candidatesAsync.data ?? []).filter((c) => !existingIds.has(c.id)),
    [candidatesAsync.data, existingIds],
  );

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
    <div className="rounded-xl border border-hairline bg-surface-soft px-4 py-3.5">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <UserPlus className="h-4 w-4 text-muted" />
        加入候选人到流程
      </div>

      {candidatesAsync.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          加载候选人…
        </div>
      ) : candidatesAsync.error ? (
        <p className="text-sm text-danger-600">{candidatesAsync.error.message}</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted-soft">
          简历库中的候选人都已在本岗位流程中。
        </p>
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
          </div>
          <Button
            onClick={handleAdd}
            loading={adding}
            disabled={!candidateId || adding}
            size="sm"
          >
            加入流程
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
    </div>
  );
}
