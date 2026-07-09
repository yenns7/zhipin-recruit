import { useState } from 'react';
import { X } from 'lucide-react';
import { COMMON_CITY_OPTIONS } from '../../lib/constants/cities';
import { COMMON_JOB_DEPARTMENT_OPTIONS } from '../../lib/constants/jobs';
import { api } from '../../lib/api';
import { Button, Card, CardBody, CardHeader, CardTitle, ErrorState, Input } from '../ui';
import { Reveal } from '../motion';
import type {
  CreateJobResponse,
  JdClarificationQuestion,
} from '../../types';

export interface CreateJobFormProps {
  onCreated: (result: CreateJobResponse) => void;
  onCancel: () => void;
}

export function CreateJobForm({ onCreated, onCancel }: CreateJobFormProps) {
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [department, setDepartment] = useState('');
  const [jobCode, setJobCode] = useState('');
  const [jdText, setJdText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'edit' | 'clarify'>('edit');
  const [clarifying, setClarifying] = useState(false);
  const [questions, setQuestions] = useState<JdClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const titleMissing = title.trim() === '';
  const jdMissing = jdText.trim() === '';
  const inputsMissing = titleMissing || jdMissing;

  function resetFlow() {
    setPhase('edit');
    setQuestions([]);
    setAnswers({});
    setFormError(null);
  }

  async function saveJob() {
    setSubmitting(true);
    setFormError(null);

    try {
      const result = await api.createJob({
        title: title.trim(),
        jdText: jdText.trim(),
      });
      onCreated(result);
      setTitle('');
      setCity('');
      setDepartment('');
      setJobCode('');
      setJdText('');
      resetFlow();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '创建失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClarify() {
    if (inputsMissing) {
      setFormError(titleMissing ? '请填写岗位名称' : '请填写岗位描述');
      return;
    }

    setClarifying(true);
    setFormError(null);

    try {
      const response = await api.clarifyJob(title.trim(), jdText.trim());
      if (response.questions.length === 0) {
        await saveJob();
      } else {
        setQuestions(response.questions);
        setPhase('clarify');
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'AI 澄清失败，可直接保存');
    } finally {
      setClarifying(false);
    }
  }

  async function handleConfirmSave() {
    await saveJob();
  }

  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{phase === 'edit' ? '新建岗位' : 'AI 澄清追问'}</CardTitle>
            <p className="mt-1 text-xs text-muted">偶发创建入口，保存后会自动回到岗位列表</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={clarifying || submitting}
            className="rounded-md p-2 text-muted hover:bg-surface-soft hover:text-ink disabled:opacity-50"
            aria-label="收起新增岗位"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardBody>
        {phase === 'edit' ? (
          <div className="space-y-4">
            <Input
              label="岗位名称"
              name="title"
              placeholder="例：前端工程师"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={clarifying || submitting}
              required
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="城市"
                name="city"
                list="job-city-options"
                placeholder="例：深圳"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                disabled={clarifying || submitting}
              />
              <datalist id="job-city-options">
                {COMMON_CITY_OPTIONS.map((cityName) => (
                  <option key={cityName} value={cityName} />
                ))}
              </datalist>
              <Input
                label="部门"
                name="department"
                list="job-department-options"
                placeholder="例：技术研发部"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                disabled={clarifying || submitting}
              />
              <datalist id="job-department-options">
                {COMMON_JOB_DEPARTMENT_OPTIONS.map((departmentName) => (
                  <option key={departmentName} value={departmentName} />
                ))}
              </datalist>
              <Input
                label="岗位编号"
                name="job_code"
                placeholder="例：SH-BE-001"
                value={jobCode}
                onChange={(event) => setJobCode(event.target.value)}
                disabled={clarifying || submitting}
              />
            </div>
            <div className="w-full">
              <label htmlFor="jd_text" className="mb-1.5 block text-sm font-medium text-ink">
                岗位描述（JD）
              </label>
              <textarea
                id="jd_text"
                name="jd_text"
                rows={6}
                placeholder="粘贴或输入完整的职位描述，AI 将先追问缺失信息，再解析技能要求…"
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                disabled={clarifying || submitting}
                className={[
                  'w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink',
                  'resize-y placeholder:text-muted-soft',
                  'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                ].join(' ')}
              />
            </div>

            {formError && <ErrorState className="px-3 py-2 text-xs" message={formError} />}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleClarify}
                disabled={inputsMissing || clarifying || submitting}
                loading={clarifying || submitting}
              >
                {clarifying ? 'AI 审阅 JD 中…' : submitting ? '创建中…' : '下一步：AI 澄清'}
              </Button>
              <span className="text-xs text-muted-soft">AI 会先检查 JD 是否缺少关键信息</span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border border-hairline-soft bg-surface-soft px-4 py-3">
              <p className="text-xs text-muted">
                AI 发现以下信息可能缺失或模糊，补充后岗位画像与匹配会更准确。可逐项填写，也可留空直接保存。
              </p>
            </div>

            <Reveal className="space-y-4" stagger={0.06}>
              {questions.map((question) => (
                <div key={question.field || question.question}>
                  <label
                    htmlFor={`clarify-${question.field}`}
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    {question.question}
                  </label>
                  <input
                    id={`clarify-${question.field}`}
                    type="text"
                    placeholder={question.placeholder || '补充说明（可留空）'}
                    value={answers[question.field] ?? ''}
                    onChange={(event) =>
                      setAnswers((previous) => ({
                        ...previous,
                        [question.field]: event.target.value,
                      }))
                    }
                    disabled={submitting}
                    className={[
                      'w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink',
                      'placeholder:text-muted-soft',
                      'focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    ].join(' ')}
                  />
                </div>
              ))}
            </Reveal>

            {formError && <ErrorState className="px-3 py-2 text-xs" message={formError} />}

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
