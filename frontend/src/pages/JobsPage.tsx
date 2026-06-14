// 岗位管理页 — 新建岗位 + 岗位列表。

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/formatDate';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  EmptyState,
  ErrorState,
  PageHeader,
} from '../components/ui';
import type {
  CreateJobResponse,
  JobStructured,
  JdClarificationQuestion,
  JdClarificationAnswer,
} from '../types';
import { Reveal } from '../components/motion';

// ---- Structured JD result renderer ----

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => typeof i === 'string');
}

// Render the free-form `structured` object from the LLM defensively.
function StructuredResult({ structured }: { structured: JobStructured }) {
  const entries = Object.entries(structured);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-soft">暂无结构化内容</p>;
  }

  // Label map for well-known keys
  const LABELS: Record<string, string> = {
    education: '学历要求',
    major: '专业要求',
    skills: '技能要求',
    skill_tags_raw: '技能标签',
    experience: '工作经验',
    responsibilities: '岗位职责',
    requirements: '任职要求',
  };

  return (
    <dl className="space-y-3">
      {entries.map(([k, v]) => {
        const label = LABELS[k] ?? k;
        let content: React.ReactNode;

        if (v === null || v === undefined || v === '') {
          content = <span className="text-muted-soft">—</span>;
        } else if (isStringArray(v)) {
          content = (
            <div className="flex flex-wrap gap-1.5">
              {(v as string[]).map((tag) => (
                <Badge key={tag} tone="brand">
                  {tag}
                </Badge>
              ))}
            </div>
          );
        } else if (Array.isArray(v)) {
          content = (
            <ul className="ml-4 list-disc space-y-0.5 text-sm text-body">
              {v.map((item, i) => (
                <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          );
        } else if (typeof v === 'object') {
          content = (
            <pre className="text-xs text-muted whitespace-pre-wrap">
              {JSON.stringify(v, null, 2)}
            </pre>
          );
        } else {
          content = <span className="text-sm text-body">{String(v)}</span>;
        }

        return (
          <div key={k}>
            <dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd>{content}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// ---- Create-job form ----

interface CreateJobFormProps {
  onCreated: (result: CreateJobResponse) => void;
}

function CreateJobForm({ onCreated }: CreateJobFormProps) {
  const [title, setTitle] = useState('');
  const [jdText, setJdText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Clarification flow: 'edit' → fetch questions → 'clarify' → save.
  const [phase, setPhase] = useState<'edit' | 'clarify'>('edit');
  const [clarifying, setClarifying] = useState(false);
  const [questions, setQuestions] = useState<JdClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const titleMissing = title.trim() === '';
  const jdMissing = jdText.trim() === '';
  const inputsMissing = titleMissing || jdMissing;

  // Reset back to a clean editing state.
  function resetFlow() {
    setPhase('edit');
    setQuestions([]);
    setAnswers({});
    setFormError(null);
  }

  // Persist the job, optionally with HR's clarification answers folded in.
  async function saveJob(clarifications: JdClarificationAnswer[]) {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await api.createJob({
        title: title.trim(),
        jd_text: jdText.trim(),
        clarifications,
      });
      onCreated(result);
      setTitle('');
      setJdText('');
      resetFlow();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  // Step 1: ask the AI which details the JD is missing.
  async function handleClarify() {
    if (inputsMissing) {
      setFormError(titleMissing ? '请填写岗位名称' : '请填写岗位描述');
      return;
    }
    setClarifying(true);
    setFormError(null);
    try {
      const res = await api.clarifyJob(title.trim(), jdText.trim());
      if (res.questions.length === 0) {
        // JD already complete — save directly.
        await saveJob([]);
      } else {
        setQuestions(res.questions);
        setPhase('clarify');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'AI 澄清失败，可直接保存');
    } finally {
      setClarifying(false);
    }
  }

  // Step 2: submit with whatever answers HR provided (blanks allowed).
  async function handleConfirmSave() {
    const clarifications: JdClarificationAnswer[] = questions
      .map((q) => ({ question: q.question, answer: (answers[q.field] ?? '').trim() }))
      .filter((c) => c.answer !== '');
    await saveJob(clarifications);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{phase === 'edit' ? '新建岗位' : 'AI 澄清追问'}</CardTitle>
      </CardHeader>
      <CardBody>
        {phase === 'edit' ? (
          <div className="space-y-4">
            <Input
              label="岗位名称"
              name="title"
              placeholder="例：前端工程师"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={clarifying || submitting}
              required
            />
            <div className="w-full">
              <label
                htmlFor="jd_text"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                岗位描述（JD）
              </label>
              <textarea
                id="jd_text"
                name="jd_text"
                rows={6}
                placeholder="粘贴或输入完整的职位描述，AI 将先追问缺失信息，再解析技能要求…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                disabled={clarifying || submitting}
                className={[
                  'w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink',
                  'placeholder:text-muted-soft resize-y',
                  'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                ].join(' ')}
              />
            </div>

            {formError && <p className="text-xs text-danger-600">{formError}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleClarify}
                disabled={inputsMissing || clarifying || submitting}
                loading={clarifying || submitting}
              >
                {clarifying ? 'AI 审阅 JD 中…' : submitting ? '创建中…' : '下一步：AI 澄清'}
              </Button>
              <span className="text-xs text-muted-soft">
                AI 会先检查 JD 是否缺少关键信息
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border border-hairline-soft bg-surface-soft px-4 py-3">
              <p className="text-xs text-muted">
                AI 发现以下信息可能缺失或模糊，补充后岗位画像与匹配会更准确。
                可逐项填写，也可留空直接保存。
              </p>
            </div>

            <Reveal className="space-y-4" stagger={0.06}>
              {questions.map((q) => (
                <div key={q.field || q.question}>
                  <label
                    htmlFor={`clarify-${q.field}`}
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    {q.question}
                  </label>
                  <input
                    id={`clarify-${q.field}`}
                    type="text"
                    placeholder={q.placeholder || '补充说明（可留空）'}
                    value={answers[q.field] ?? ''}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.field]: e.target.value }))
                    }
                    disabled={submitting}
                    className={[
                      'w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink',
                      'placeholder:text-muted-soft',
                      'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    ].join(' ')}
                  />
                </div>
              ))}
            </Reveal>

            {formError && <p className="text-xs text-danger-600">{formError}</p>}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleConfirmSave}
                loading={submitting}
                disabled={submitting}
              >
                {submitting ? '创建中…' : '确认并保存岗位'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={resetFlow}
                disabled={submitting}
              >
                返回修改 JD
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ---- Page ----

export function JobsPage() {
  const { data, loading, error, reload } = useAsync(() => api.listJobs(), []);

  // Latest created job result — shown inline after creation
  const [lastCreated, setLastCreated] = useState<CreateJobResponse | null>(null);

  const handleCreated = useCallback(
    (result: CreateJobResponse) => {
      setLastCreated(result);
      reload();
    },
    [reload]
  );

  const jobs = data ?? [];

  // Close (take offline) a job after confirmation, then refresh the list.
  const [closingId, setClosingId] = useState<number | null>(null);
  const handleClose = useCallback(
    async (jobId: number, title: string) => {
      if (!window.confirm(`确认关闭岗位「${title}」？关闭后将从在招列表移除。`)) return;
      setClosingId(jobId);
      try {
        await api.closeJob(jobId);
        reload();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '关闭失败');
      } finally {
        setClosingId(null);
      }
    },
    [reload]
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        title="岗位管理"
        description="创建招聘岗位并查看 AI 解析的技能要求"
      />

      {/* Create form */}
      <CreateJobForm onCreated={handleCreated} />

      {/* AI 解析结果 after creation */}
      {lastCreated && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI 解析结果</CardTitle>
                <p className="mt-0.5 text-xs text-muted">岗位：{lastCreated.title}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastCreated(null)} aria-label="关闭解析结果">✕</Button>
            </div>
          </CardHeader>
          <CardBody>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">技能要求</p>
            <StructuredResult structured={lastCreated.structured} />
          </CardBody>
        </Card>
      )}

      {/* Job list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>岗位列表</CardTitle>
            {!loading && (
              <span className="text-xs text-muted-soft">共 {jobs.length} 个岗位</span>
            )}
          </div>
        </CardHeader>

        {loading ? (
          <CardBody className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </CardBody>
        ) : error ? (
          <CardBody>
            <ErrorState message={error.message} onRetry={reload} />
          </CardBody>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="暂无岗位"
            description="使用上方表单新建第一个招聘岗位"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline-soft bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">岗位名称</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <Reveal as="tbody" className="divide-y divide-hairline-soft" stagger={0.05} y={12}>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="transition-colors hover:bg-surface-soft"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ink">{job.title}</span>
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/jobs/${job.id}/match`}
                          className="text-xs font-medium text-ink hover:text-body hover:underline"
                        >
                          匹配候选人
                        </Link>
                        <button
                          onClick={() => handleClose(job.id, job.title)}
                          disabled={closingId === job.id}
                          className="text-xs font-medium text-muted hover:text-danger-600 disabled:opacity-50"
                        >
                          {closingId === job.id ? '关闭中…' : '关闭'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Reveal>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
