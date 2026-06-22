import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Select } from '../ui';

export function ReassignOwner({
  candidateId,
  currentOwnerId,
  onReassigned,
}: {
  candidateId: number;
  currentOwnerId?: number;
  onReassigned?: () => void;
}) {
  const ownersAsync = useAsync(() => api.listCandidateOwners(), []);
  const [ownerId, setOwnerId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const currentOwner = (ownersAsync.data ?? []).find((owner) => owner.id === currentOwnerId);

  async function submit() {
    const id = Number(ownerId);
    if (!ownerId || Number.isNaN(id)) {
      setMsg('请选择新的招聘专员');
      return;
    }
    if (!reason.trim()) {
      setMsg('请填写转派原因');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.reassignCandidate(candidateId, id, reason.trim());
      setMsg('已转派');
      setOwnerId('');
      setReason('');
      onReassigned?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '转派失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-surface-soft px-3 py-3">
      <p className="mb-2 text-xs text-muted">
        当前负责人：{currentOwner?.name ?? (currentOwnerId ? `专员 #${currentOwnerId}` : '未设置')}
      </p>
      <div className="grid gap-2 md:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_auto] md:items-end">
        <Select
          label="选择新的招聘专员"
          value={ownerId}
          disabled={busy || ownersAsync.loading}
          onChange={(e) => {
            setOwnerId(e.target.value);
            setMsg(null);
          }}
        >
          <option value="">请选择招聘专员</option>
          {(ownersAsync.data ?? []).map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}（{owner.email}）
            </option>
          ))}
        </Select>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">转派原因</label>
          <input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setMsg(null);
            }}
            placeholder="例如：试点分工调整"
            className="h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
          />
        </div>
        <Button
          onClick={submit}
          loading={busy}
          disabled={busy || ownersAsync.loading}
          size="sm"
          variant="secondary"
        >
          转派
        </Button>
      </div>
      {ownersAsync.error && <p className="mt-2 text-xs text-danger-600">{ownersAsync.error.message}</p>}
      {ownersAsync.data?.length === 0 && (
        <p className="mt-2 text-xs text-muted">暂无启用中的招聘专员，请管理员先创建或启用招聘专员账号。</p>
      )}
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </div>
  );
}
