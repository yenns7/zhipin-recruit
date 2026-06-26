import { useState } from 'react';
import { Button, Input } from '../ui';
import type { CandidateDispositionInput } from '../../types';

interface RejectionDispositionFormProps {
  busy: boolean;
  onSubmit: (disposition: CandidateDispositionInput, note: string) => void | Promise<void>;
  onCancel: () => void;
}

export function RejectionDispositionForm({
  busy,
  onSubmit,
  onCancel,
}: RejectionDispositionFormProps) {
  const [reason, setReason] = useState('');
  const [enterTalentPool, setEnterTalentPool] = useState(true);
  const [nextContactAt, setNextContactAt] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [note, setNote] = useState('');

  const tags = tagsText
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  async function handleSubmit() {
    const finalNote = reason.trim() ? `淘汰原因：${reason.trim()}` : '淘汰沉淀';
    await onSubmit(
      {
        reason: reason.trim(),
        enter_talent_pool: enterTalentPool,
        next_contact_at: nextContactAt || undefined,
        tags,
        note: note.trim(),
      },
      note.trim() ? `${finalNote}；${note.trim()}` : finalNote,
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-danger-100 bg-danger-50 p-3">
      <Input
        label="淘汰原因"
        value={reason}
        placeholder="例：经验年限不足 / 薪资不匹配"
        onChange={(e) => setReason(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-body">
        <input
          type="checkbox"
          checked={enterTalentPool}
          onChange={(e) => setEnterTalentPool(e.target.checked)}
          className="h-4 w-4 rounded border-hairline"
        />
        进入人才池，后续可再次匹配
      </label>
      <Input
        label="未来可联系时间"
        type="date"
        value={nextContactAt}
        onChange={(e) => setNextContactAt(e.target.value)}
      />
      <Input
        label="候选人标签"
        value={tagsText}
        placeholder="用逗号分隔，例如 AI产品, 后续关注"
        onChange={(e) => setTagsText(e.target.value)}
      />
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        rows={2}
        placeholder="补充备注"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" size="sm" loading={busy} disabled={busy} onClick={handleSubmit}>
          确认淘汰
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
