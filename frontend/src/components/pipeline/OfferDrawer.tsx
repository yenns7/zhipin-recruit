import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Button, Input, Select, Spinner } from '../ui';

interface OfferDrawerProps {
  candidateId: number;
  jobId: number;
}

const APPROVAL_STATUS = [
  { value: 'draft', label: '草稿' },
  { value: 'pending', label: '待审批' },
  { value: 'approved', label: '已审批' },
  { value: 'sent', label: '已发出' },
  { value: 'accepted', label: '已接受' },
  { value: 'declined', label: '已拒绝' },
];

export function OfferDrawer({ candidateId, jobId }: OfferDrawerProps) {
  const { data, loading, error, reload } = useAsync(
    () => api.getOfferRecord(jobId, candidateId),
    [jobId, candidateId],
  );
  const [salaryRange, setSalaryRange] = useState('');
  const [onboardDate, setOnboardDate] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('draft');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSalaryRange(data.salary_range ?? '');
    setOnboardDate(data.onboard_date ?? '');
    setApprovalStatus(data.approval_status ?? 'draft');
    setNote(data.note ?? '');
  }, [data]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await api.saveOfferRecord(jobId, candidateId, {
        salary_range: salaryRange.trim(),
        onboard_date: onboardDate || null,
        approval_status: approvalStatus,
        note: note.trim(),
      });
      setMessage('Offer 信息已保存');
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-2 rounded-lg border border-success-100 bg-success-50 p-3">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
        {error.message}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-success-100 bg-success-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="薪资范围"
          value={salaryRange}
          placeholder="例：25-30K * 14"
          onChange={(e) => setSalaryRange(e.target.value)}
        />
        <Input
          label="预计到岗时间"
          type="date"
          value={onboardDate}
          onChange={(e) => setOnboardDate(e.target.value)}
        />
      </div>
      <Select
        label="审批状态"
        value={approvalStatus}
        onChange={(e) => setApprovalStatus(e.target.value)}
      >
        {APPROVAL_STATUS.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </Select>
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        rows={2}
        placeholder="Offer 备注"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {message && <p className="text-sm text-muted">{message}</p>}
      <Button type="button" size="sm" variant="secondary" loading={saving} disabled={saving} onClick={handleSave}>
        保存 Offer
      </Button>
    </div>
  );
}
