// AI 预筛面试页 — 三阶段流程：配置 → 作答（HR 代录）→ 报告。

import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  PageHeader,
  Select,
} from '../components/ui';
import { InterviewReport } from '../components/InterviewReport';
import { Reveal } from '../components/motion';
import type { InterviewReport as InterviewReportType, QaPair } from '../types';

type Phase = 'setup' | 'answer' | 'report';

// ---- Setup phase ----

interface SetupProps {
  onStart: (candidateId: number, jobId: number, questions: string[]) => void;
}

function SetupPhase({ onStart }: SetupProps) {
  const candidatesAsync = useAsync(() => api.listCandidates(), []);
  const jobsAsync = useAsync(() => api.listJobs(), []);

  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [count, setCount] = useState('5');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoading = candidatesAsync.loading || jobsAsync.loading;

  async function handleStart() {
    const cid = Number(candidateId);
    const jid = Number(jobId);
    const cnt = Number(count) || 5;

    if (!candidateId || Number.isNaN(cid)) {
      setError('请选择候选人');
      return;
    }
    if (!jobId || Number.isNaN(jid)) {
      setError('请选择岗位');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.startInterview({
        candidate_id: cid,
        job_id: jid,
        count: cnt,
      });
      onStart(cid, jid, res.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardBody className="flex items-center justify-center gap-3 py-20">
          <Spinner size="lg" />
          <span className="text-sm text-muted">加载候选人与岗位数据…</span>
        </CardBody>
      </Card>
    );
  }

  const loadError = candidatesAsync.error?.message ?? jobsAsync.error?.message;
  if (loadError) {
    const retryFn = candidatesAsync.error ? candidatesAsync.reload : jobsAsync.reload;
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-danger-600">
            {loadError}
            <button
              onClick={retryFn}
              className="ml-3 font-medium underline hover:no-underline"
            >
              重试
            </button>
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>配置面试</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="max-w-md space-y-4">
          {/* Candidate */}
          <Select
            label="候选人"
            id="setup-candidate"
            value={candidateId}
            onChange={(e) => {
              setCandidateId(e.target.value);
              setError(null);
            }}
          >
            <option value="">— 请选择候选人 —</option>
            {(candidatesAsync.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_masked} (ID {c.id})
              </option>
            ))}
          </Select>

          {/* Job */}
          <Select
            label="面试岗位"
            id="setup-job"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setError(null);
            }}
          >
            <option value="">— 请选择岗位 —</option>
            {(jobsAsync.data ?? []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} (ID {j.id})
              </option>
            ))}
          </Select>

          {/* Question count */}
          <Input
            label="生成题目数量"
            id="setup-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />

          {error && <p className="text-sm text-danger-600">{error}</p>}

          <Button
            onClick={handleStart}
            loading={loading}
            disabled={loading}
            className="w-full"
          >
            {loading ? 'AI 正在生成面试题…' : '生成面试题'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ---- Answer phase ----
// 注意：这是 HR 代录候选人作答的界面，不是候选人本人作答。

interface AnswerProps {
  questions: string[];
  answers: string[];
  onAnswerChange: (index: number, value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}

function AnswerPhase({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  submitting,
  submitError,
}: AnswerProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>录入候选人作答</CardTitle>
            <span className="text-xs text-muted">
              共 {questions.length} 题 — 录入候选人作答内容，用于 AI 评估
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="mb-4 rounded-lg bg-surface-soft border border-hairline-soft px-4 py-3">
            <p className="text-xs text-muted">
              请将候选人对以下题目的实际作答内容逐题录入，提交后将由 AI 进行综合评估并生成报告。
            </p>
          </div>
          <Reveal className="space-y-6" stagger={0.06}>
            {questions.map((q, i) => (
              <div key={i}>
                <p className="mb-2 text-sm font-medium text-ink">
                  <span className="mr-2 text-muted-soft">{i + 1}.</span>
                  {q}
                </p>
                <textarea
                  id={`answer-${i}`}
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  rows={3}
                  placeholder={`在此录入该候选人对第 ${i + 1} 题的作答内容…`}
                  value={answers[i] ?? ''}
                  onChange={(e) => onAnswerChange(i, e.target.value)}
                  aria-label={`第 ${i + 1} 题 · 候选人作答录入`}
                />
              </div>
            ))}
          </Reveal>

          {submitError && (
            <div className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {submitError}
            </div>
          )}

          <div className="mt-6">
            <Button
              onClick={onSubmit}
              loading={submitting}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? 'AI 正在评估作答…' : '提交 AI 评估'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---- Page ----

export function InterviewsPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [candidateId, setCandidateId] = useState<number>(0);
  const [jobId, setJobId] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<InterviewReportType | null>(null);
  const [interviewId, setInterviewId] = useState<number | null>(null);

  function handleStart(cid: number, jid: number, qs: string[]) {
    setCandidateId(cid);
    setJobId(jid);
    setQuestions(qs);
    setAnswers(new Array(qs.length).fill(''));
    setPhase('answer');
  }

  function handleAnswerChange(index: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function handleSubmit() {
    const qaPairs: QaPair[] = questions.map((q, i) => ({
      q,
      a: answers[i] ?? '',
    }));

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitInterview({
        candidate_id: candidateId,
        job_id: jobId,
        qa_pairs: qaPairs,
      });
      setReport(res.report);
      setInterviewId(res.interview_id);
      setPhase('report');
    } catch (err) {
      // Error must NOT lose entered answers — stay on answer phase
      setSubmitError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setPhase('setup');
    setQuestions([]);
    setAnswers([]);
    setReport(null);
    setInterviewId(null);
    setSubmitError(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="AI 面试"
        description="生成定制面试题，录入候选人作答，获取 AI 评估报告"
        actions={
          phase !== 'setup' ? (
            <Button variant="secondary" size="sm" onClick={handleReset}>
              重新开始
            </Button>
          ) : undefined
        }
      />

      {/* Phase indicator */}
      <div className="flex items-center gap-0">
        {(['setup', 'answer', 'report'] as Phase[]).map((p, i) => {
          const labels: Record<Phase, string> = {
            setup: '配置',
            answer: '录入作答',
            report: '评估报告',
          };
          const isActive = phase === p;
          const isDone =
            (p === 'setup' && (phase === 'answer' || phase === 'report')) ||
            (p === 'answer' && phase === 'report');
          return (
            <span key={p} className="flex items-center gap-0">
              {i > 0 && (
                <span className="mx-2 text-hairline">›</span>
              )}
              <span className="flex items-center gap-1.5">
                <span
                  className={[
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                    isActive
                      ? 'bg-ink text-on-primary'
                      : isDone
                        ? 'bg-success-100 text-success-700'
                        : 'bg-surface-strong text-muted',
                  ].join(' ')}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span
                  className={[
                    'text-sm',
                    isActive
                      ? 'font-semibold text-ink'
                      : isDone
                        ? 'text-success-600'
                        : 'text-muted-soft',
                  ].join(' ')}
                >
                  {labels[p]}
                </span>
              </span>
            </span>
          );
        })}
      </div>

      {/* Phase content */}
      {phase === 'setup' && <SetupPhase onStart={handleStart} />}

      {phase === 'answer' && (
        <AnswerPhase
          questions={questions}
          answers={answers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      {phase === 'report' && report && (
        <>
          <InterviewReport
            report={report}
            questions={questions}
            meta={
              interviewId !== null
                ? {
                    interviewId,
                    candidateId,
                    jobId,
                    createdAt: new Date().toISOString(),
                  }
                : undefined
            }
          />
        </>
      )}

      {phase === 'report' && !report && (
        <Card>
          <CardBody>
            <p className="text-sm text-danger-600">
              报告生成失败，请重试
              <button
                onClick={handleReset}
                className="ml-3 font-medium underline hover:no-underline"
              >
                重新开始
              </button>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
