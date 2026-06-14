import { useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type { PipelineStage } from '../../types';

const ROUNDS: { key: PipelineStage; label: string }[] = [
  { key: 'interview_first', label: '一面' },
  { key: 'interview_second', label: '二面' },
  { key: 'interview_final', label: '终面' },
];

export function FeedbackForm({
  candidateId,
  jobId,
  onSubmitted,
}: {
  candidateId: number;
  jobId: number;
  onSubmitted?: () => void;
}) {
  const [round, setRound] = useState<PipelineStage>('interview_first');
  const [score, setScore] = useState(3);
  const [passed, setPassed] = useState(true);
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      await api.submitFeedback({
        candidate_id: candidateId,
        job_id: jobId,
        round,
        score,
        passed,
        strengths,
        concerns,
      });
      setMsg('已提交评分');
      onSubmitted?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="轮次"
          value={round}
          onChange={(e) => setRound(e.target.value as PipelineStage)}
        >
          {ROUNDS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          label="评分(1-5)"
          value={String(score)}
          onChange={(e) => setScore(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <Select
        label="是否通过"
        value={passed ? 'y' : 'n'}
        onChange={(e) => setPassed(e.target.value === 'y')}
      >
        <option value="y">通过</option>
        <option value="n">不通过</option>
      </Select>
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2}
        placeholder="优势"
        value={strengths}
        onChange={(e) => setStrengths(e.target.value)}
      />
      <textarea
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2}
        placeholder="顾虑"
        value={concerns}
        onChange={(e) => setConcerns(e.target.value)}
      />
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <Button onClick={submit} loading={busy} disabled={busy} size="sm">
        提交评分
      </Button>
    </div>
  );
}
