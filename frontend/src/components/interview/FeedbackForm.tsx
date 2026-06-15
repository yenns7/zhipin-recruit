import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type { EvaluationScores, PipelineStage } from '../../types';
import { stageLabel } from '../../lib/pipelineStages';

const ROUNDS: { key: PipelineStage; label: string }[] = [
  { key: 'interview_first', label: '一面' },
  { key: 'interview_second', label: '二面' },
  { key: 'interview_final', label: '终面' },
];

const ROUND_KEYS = new Set(ROUNDS.map((round) => round.key));

const ADVANCE_TARGET: Partial<Record<PipelineStage, PipelineStage>> = {
  interview_first: 'interview_second',
  interview_second: 'interview_final',
  interview_final: 'offer',
};

const EVALUATION_DIMENSIONS = ['专业能力', '沟通表达', '业务理解', '项目经验', '文化匹配'];

const DEFAULT_EVALUATION = EVALUATION_DIMENSIONS.reduce<EvaluationScores>((acc, item) => {
  acc[item] = 3;
  return acc;
}, {});

export function FeedbackForm({
  candidateId,
  jobId,
  initialRound,
  onMove,
  onSubmitted,
}: {
  candidateId: number;
  jobId: number;
  initialRound?: PipelineStage;
  onMove?: (toStage: PipelineStage, note: string) => void | Promise<void>;
  onSubmitted?: () => void;
}) {
  const defaultRound = useMemo(
    () => (initialRound && ROUND_KEYS.has(initialRound) ? initialRound : 'interview_first'),
    [initialRound],
  );
  const [round, setRound] = useState<PipelineStage>(defaultRound);
  const [score, setScore] = useState(3);
  const [passed, setPassed] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationScores>(DEFAULT_EVALUATION);
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'advance' | 'reject' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const advanceStage = ADVANCE_TARGET[round];
  const busy = busyAction !== null;

  useEffect(() => {
    setRound(defaultRound);
  }, [defaultRound]);

  async function submit(targetStage?: PipelineStage) {
    const action = targetStage === 'rejected' ? 'reject' : targetStage ? 'advance' : 'save';
    setBusyAction(action);
    setMsg(null);
    try {
      await api.submitFeedback({
        candidate_id: candidateId,
        job_id: jobId,
        round,
        score,
        passed,
        evaluation,
        strengths,
        concerns,
      });
      if (targetStage) {
        const note = `${stageLabel(round)}反馈${passed ? '通过' : '未通过'}，评分 ${score}/5`;
        if (onMove) {
          await onMove(targetStage, note);
        } else {
          await api.movePipeline({
            candidate_id: candidateId,
            job_id: jobId,
            stage: targetStage,
            note,
          });
        }
      }
      setMsg(targetStage ? '已提交评分并更新流程' : '已提交评分');
      onSubmitted?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally {
      setBusyAction(null);
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
      <div className="rounded-md border border-hairline bg-canvas p-3">
        <p className="mb-3 text-sm font-medium text-ink">评价维度</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {EVALUATION_DIMENSIONS.map((dimension) => (
            <Select
              key={dimension}
              label={dimension}
              value={String(evaluation[dimension] ?? 3)}
              onChange={(e) => setEvaluation((prev) => ({
                ...prev,
                [dimension]: Number(e.target.value),
              }))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </div>
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
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => submit()} loading={busyAction === 'save'} disabled={busy} size="sm">
          提交评分
        </Button>
        {advanceStage && (
          <Button
            variant="secondary"
            onClick={() => submit(advanceStage)}
            loading={busyAction === 'advance'}
            disabled={busy || !passed}
            size="sm"
          >
            提交并推进
          </Button>
        )}
        <Button
          variant="danger"
          onClick={() => submit('rejected')}
          loading={busyAction === 'reject'}
          disabled={busy}
          size="sm"
        >
          提交并淘汰
        </Button>
      </div>
    </div>
  );
}
