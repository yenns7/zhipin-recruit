import { useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui';

export function ReassignOwner({
  candidateId,
  currentOwnerId,
  onReassigned,
}: {
  candidateId: number;
  currentOwnerId?: number;
  onReassigned?: () => void;
}) {
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const id = Number(ownerId);
    if (!ownerId || Number.isNaN(id)) {
      setMsg('请输入有效的 HR 用户 ID');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.reassignCandidate(candidateId, id);
      setMsg('已转派');
      setOwnerId('');
      onReassigned?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '转派失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-muted">转派给 HR（用户 ID）</label>
        <input
          type="number"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder={currentOwnerId ? `当前 owner: ${currentOwnerId}` : 'HR 用户 ID'}
          className="h-9 w-40 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>
      <Button onClick={submit} loading={busy} disabled={busy} size="sm" variant="secondary">
        转派
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
