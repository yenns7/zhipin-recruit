import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type { EvaluationScores, InterviewRound, PipelineStage } from '../../types';

const ROUNDS: { key: InterviewRound; label: string }[] = [
  { key: 'round_1', label: '第 1 轮面试' },
  { key: 'round_2', label: '第 2 轮面试' },
  { key: 'round_3', label: '第 3 轮面试' },
  { key: 'additional', label: '加面' },
  { key: 'technical', label: '技术面' },
  { key: 'business', label: '业务面' },
  { key: 'hr', label: 'HR 面' },
];

const ROUND_KEYS = new Set(ROUNDS.map((round) => round.key));

const EVALUATION_DIMENSIONS = ['专业能力', '沟通表达', '业务理解', '项目经验', '文化匹配'];

const FEEDBACK_REASON_OPTIONS = [
  '专业能力不匹配',
  '项目经验不足',
  '行业经验不匹配',
  '沟通表达不符合预期',
  '稳定性存疑',
  '薪资期望不匹配',
  '到岗时间不匹配',
  '候选人意愿不强',
  '候选人主动放弃',
  '候选人已接受其他机会',
  '工作地点不匹配',
  '面试时间无法协调',
  '简历信息存疑',
  '背景匹配度不足',
  '岗位画像变化',
  '部门内部意见不一致',
  '面试标准变化',
  'HC暂缓或冻结',
  '岗位暂停招聘',
  '组织架构或汇报关系变化',
  '优先级下降',
  '薪资预算变化',
  '需要加面确认',
  '需要补充作品或案例',
  '面试官暂未形成结论',
  '其他',
];

const DEFAULT_EVALUATION = EVALUATION_DIMENSIONS.reduce<EvaluationScores>((acc, item) => {
  acc[item] = 3;
  return acc;
}, {});

export function FeedbackForm({
  candidateId,
  jobId,
  initialRound,
  canMovePipeline = true,
  onMove,
  onSubmitted,
}: {
  candidateId: number;
  jobId: number;
  initialRound?: InterviewRound;
  canMovePipeline?: boolean;
  onMove?: (toStage: PipelineStage, note: string) => void | Promise<void>;
  onSubmitted?: () => void;
}) {
  const defaultRound = useMemo(
    () => (initialRound && ROUND_KEYS.has(initialRound) ? initialRound : 'round_1'),
    [initialRound],
  );
  const [round, setRound] = useState<InterviewRound>(defaultRound);
  const [score, setScore] = useState(3);
  const [passed, setPassed] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationScores>(DEFAULT_EVALUATION);
  const [reasonTags, setReasonTags] = useState<string[]>([]);
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'advance' | 'reject' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const advanceStage: PipelineStage = 'offer';
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
          reason_tags: reasonTags,
          strengths,
          concerns,
        });
      if (targetStage) {
        const roundText = ROUNDS.find((item) => item.key === round)?.label ?? '面试';
        const note = `${roundText}反馈${passed ? '通过' : '未通过'}，评分 ${score}/5`;
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

  function toggleReason(tag: string) {
    setReasonTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
      <p className="text-sm font-medium text-ink">人工反馈</p>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="轮次"
          value={round}
          onChange={(e) => setRound(e.target.value as InterviewRound)}
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
        <p className="mb-3 text-sm font-medium text-ink">原因分类</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_REASON_OPTIONS.map((tag) => {
            const checked = reasonTags.includes(tag);
            return (
              <label
                key={tag}
                className={[
                  'inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  checked
                    ? 'border-ink bg-ink text-white'
                    : 'border-hairline bg-surface-soft text-muted hover:text-ink',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleReason(tag)}
                />
                {tag}
              </label>
            );
          })}
        </div>
      </div>
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
        {canMovePipeline && (
          <>
            <Button
              variant="secondary"
              onClick={() => submit(advanceStage)}
              loading={busyAction === 'advance'}
              disabled={busy || !passed}
              size="sm"
            >
              提交并推进 Offer
            </Button>
            <Button
              variant="danger"
              onClick={() => submit('rejected')}
              loading={busyAction === 'reject'}
              disabled={busy}
              size="sm"
            >
              提交并淘汰
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
