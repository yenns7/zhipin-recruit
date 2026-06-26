import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAsync } from '../../../lib/useAsync';
import { formatDate } from '../../../lib/formatDate';
import { stageLabel } from '../../../lib/pipelineStages';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { RecruitmentManagementTabs } from '../../../components/recruitment/RecruitmentManagementTabs';
import type {
  DemandPriority,
  DemandStatus,
  JobListItem,
  PipelineStage,
  RecruitmentDemand,
} from '../../../types';
import { demandsApi } from '../api';

const PRIORITY_LABELS: Record<DemandPriority, string> = {
  A: 'A 级',
  B: 'B 级',
  C: 'C 级',
};

const STATUS_LABELS: Record<DemandStatus, string> = {
  pending: '待确认',
  active: '招聘中',
  paused: '暂停',
  filled: '已完成',
  cancelled: '已取消',
};

const RISK_LABELS: Record<string, string> = {
  overdue: '已超期',
  business_feedback_pending: '业务待反馈',
  hr_no_recommendation: 'HR 暂无推荐',
  low_interview_conversion: '推荐多但面试少',
  open_too_long: '开放过久',
};

type DemandInsightTone = 'success' | 'warning' | 'danger' | 'neutral';
type DemandActionMode = 'close' | 'restore' | 'priority';

interface DemandFormState {
  job_id: string;
  job_title: string;
  jd_text: string;
  request_no: string;
  requester_name: string;
  requester_department: string;
  hiring_manager_name: string;
  requested_at: string;
  accepted_at: string;
  target_date: string;
  priority: DemandPriority;
  headcount: string;
  note: string;
}

const EMPTY_FORM: DemandFormState = {
  job_id: '',
  job_title: '',
  jd_text: '',
  request_no: '',
  requester_name: '',
  requester_department: '',
  hiring_manager_name: '',
  requested_at: '',
  accepted_at: '',
  target_date: '',
  priority: 'B',
  headcount: '1',
  note: '',
};

interface DemandActionState {
  mode: DemandActionMode;
  demand: RecruitmentDemand;
}

function formatJobOption(job: JobListItem) {
  const code = job.job_code || `JOB-${job.id}`;
  return [code, job.title, job.city, job.department].filter(Boolean).join(' · ');
}

function priorityTone(priority: DemandPriority): 'danger' | 'warning' | 'neutral' {
  if (priority === 'A') return 'danger';
  if (priority === 'B') return 'warning';
  return 'neutral';
}

function statusTone(status: DemandStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'pending' || status === 'paused') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function metricItems(demand: RecruitmentDemand) {
  const metrics = demand.metrics;
  return [
    ['已推简历', metrics.recommended_count],
    ['业务待反馈', metrics.business_review_count],
    ['进入面试', metrics.interview_count],
    ['Offer', metrics.offer_count],
  ];
}

function stageDistributionItems(demand: RecruitmentDemand) {
  return Object.entries(demand.metrics.current_stage_counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([stage, count]) => ({
      stage,
      label: stageLabel(stage as PipelineStage),
      count: Number(count),
    }));
}

function demandInsight(demand: RecruitmentDemand): {
  title: string;
  description: string;
  tone: DemandInsightTone;
} {
  if (demand.risk_flags.includes('business_feedback_pending')) {
    return {
      title: '业务侧卡点',
      description: `${demand.metrics.business_review_count} 位候选人正在等用人部门反馈`,
      tone: 'warning',
    };
  }

  if (demand.risk_flags.includes('hr_no_recommendation')) {
    return {
      title: 'HR 侧卡点',
      description: 'HR 已接手超过 7 天，但该需求还没有候选人进入流程',
      tone: 'danger',
    };
  }

  if (demand.risk_flags.includes('overdue')) {
    return {
      title: '时间风险',
      description: '已超过期望完成时间，需要重新确认优先级或关闭原因',
      tone: 'warning',
    };
  }

  if (demand.metrics.recommended_count > 0) {
    return {
      title: '流程推进中',
      description: `已有 ${demand.metrics.recommended_count} 位候选人进入该需求流程`,
      tone: 'success',
    };
  }

  return {
    title: '待启动',
    description: '还没有候选人进入该需求流程',
    tone: 'neutral',
  };
}

function DemandCard({
  demand,
  busy,
  onClose,
  onRestore,
  onAdjustPriority,
}: {
  demand: RecruitmentDemand;
  busy: boolean;
  onClose: (demand: RecruitmentDemand) => void;
  onRestore: (demand: RecruitmentDemand) => void;
  onAdjustPriority: (demand: RecruitmentDemand) => void;
}) {
  const insight = demandInsight(demand);
  const stageItems = stageDistributionItems(demand);
  const canRestore = ['cancelled', 'filled', 'paused'].includes(demand.status);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg text-ink">{demand.job_title}</h3>
              <Badge tone={priorityTone(demand.priority)}>{PRIORITY_LABELS[demand.priority]}</Badge>
              <Badge tone={statusTone(demand.status)}>{STATUS_LABELS[demand.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {demand.requester_department || demand.job_department || '未记录部门'}
              {demand.requester_name ? ` · ${demand.requester_name}` : ''}
              {demand.request_no ? ` · ${demand.request_no}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/jobs/${demand.job_id}/match`}
              className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-sm font-semibold text-canvas hover:bg-ink-soft"
            >
              匹配候选人
            </Link>
            <Link
              to={`/pipeline?job=${demand.job_id}`}
              className="inline-flex h-8 items-center rounded-md border border-hairline px-3 text-sm font-semibold text-ink hover:bg-surface-soft"
            >
              查看该需求流程
            </Link>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onAdjustPriority(demand)}
            >
              调整优先级
            </Button>
            {canRestore ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onRestore(demand)}
              >
                恢复需求
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => onClose(demand)}
              >
                关闭需求
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metricItems(demand).map(([label, value]) => (
            <div key={label} className="rounded-md bg-surface-soft px-3 py-2">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">卡点判断</p>
              <Badge tone={insight.tone}>{insight.title}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink">{insight.description}</p>
          </div>
          <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2">
            <p className="text-xs text-muted">阶段分布</p>
            {stageItems.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {stageItems.map((item) => (
                  <Badge key={item.stage} tone={item.stage === 'business_review' ? 'warning' : 'neutral'}>
                    {item.label} {item.count}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-soft">暂无候选人进入流程</p>
            )}
          </div>
        </div>

        <div className="grid gap-2 text-sm text-muted md:grid-cols-4">
          <span>业务提需求时间：{demand.requested_at ? formatDate(demand.requested_at) : '未记录'}</span>
          <span>HR 接手时间：{demand.accepted_at ? formatDate(demand.accepted_at) : '未记录'}</span>
          <span>期望完成：{demand.target_date ? formatDate(demand.target_date) : '未记录'}</span>
          <span>需求人数：{demand.headcount}</span>
        </div>

        {demand.risk_flags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-hairline-soft pt-3">
            <AlertTriangle className="h-4 w-4 text-warning-700" />
            {demand.risk_flags.map((flag) => (
              <Badge key={flag} tone="warning">
                {RISK_LABELS[flag] ?? flag}
              </Badge>
            ))}
          </div>
        )}

        {(demand.close_reason || demand.downgrade_reason || demand.note) && (
          <p className="border-t border-hairline-soft pt-3 text-sm text-muted">
            {demand.close_reason || demand.downgrade_reason || demand.note}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function DemandActionDialog({
  action,
  reason,
  priority,
  busy,
  onReasonChange,
  onPriorityChange,
  onCancel,
  onConfirm,
}: {
  action: DemandActionState | null;
  reason: string;
  priority: DemandPriority;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onPriorityChange: (value: DemandPriority) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!action) return null;

  const { mode, demand } = action;
  const isPriority = mode === 'priority';
  const title =
    mode === 'close'
      ? `关闭需求：${demand.job_title}`
      : mode === 'restore'
        ? `恢复需求：${demand.job_title}`
        : `调整优先级：${demand.job_title}`;
  const confirmLabel =
    mode === 'close' ? '确认关闭' : mode === 'restore' ? '确认恢复' : '保存优先级';
  const impact =
    mode === 'close'
      ? '需求会从活跃列表中移出，历史流程和 BI 留痕仍会保留。'
      : mode === 'restore'
        ? '需求会回到活跃列表，岗位画像也会恢复为在招。'
        : '新的优先级会写入需求备注，后续复盘能看到调整原因。';
  const reasonPlaceholder =
    mode === 'close'
      ? '例如：业务取消、长期无反馈、需求不真实'
      : mode === 'restore'
        ? '例如：业务确认继续招聘、刚才误关闭'
        : '例如：业务重新确认、误降级后恢复优先级';
  const canConfirm = reason.trim().length > 0 && (!isPriority || priority !== demand.priority);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => !busy && onCancel()}
    >
      <div
        className="animate-slide-up w-full max-w-lg rounded-lg border border-hairline bg-canvas shadow-card-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3">
            {mode === 'close' && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-50">
                <AlertTriangle className="h-4 w-4 text-danger-600" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-display text-ink">{title}</h2>
              <p className="mt-1 text-sm text-muted">请先写清楚业务原因，方便后续审计和复盘。</p>
            </div>
          </div>

          {isPriority && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">新优先级</span>
              <select
                value={priority}
                onChange={(event) => onPriorityChange(event.target.value as DemandPriority)}
                className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              >
                <option value="A">A 级</option>
                <option value="B">B 级</option>
                <option value="C">C 级</option>
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">原因（必填）</span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={reasonPlaceholder}
              rows={4}
              className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </label>

          <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2 text-sm text-muted">
            <p className="font-medium text-ink">这次操作会影响：</p>
            <p className="mt-1">{impact}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline-soft px-5 py-3">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            variant={mode === 'close' ? 'danger' : 'primary'}
            size="sm"
            loading={busy}
            disabled={!canConfirm || busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DemandsPage() {
  const demandsAsync = useAsync(() => demandsApi.listDemands(), []);
  const jobsAsync = useAsync(() => api.listJobs(), []);
  const [form, setForm] = useState<DemandFormState>(EMPTY_FORM);
  const [reuseProfile, setReuseProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<DemandActionState | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionPriority, setActionPriority] = useState<DemandPriority>('B');

  const jobs = useMemo(() => jobsAsync.data ?? [], [jobsAsync.data]);
  const demands = useMemo(() => demandsAsync.data ?? [], [demandsAsync.data]);
  const canCreate =
    !submitting &&
    (reuseProfile
      ? Boolean(form.job_id)
      : Boolean(form.job_title.trim() && form.jd_text.trim()));

  const activeDemands = useMemo(
    () => demands.filter((item) => item.status !== 'filled' && item.status !== 'cancelled'),
    [demands],
  );

  function updateField<K extends keyof DemandFormState>(key: K, value: DemandFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleReuseProfileChange(checked: boolean) {
    setReuseProfile(checked);
    if (checked && !form.job_id && jobs.length > 0) {
      setForm((current) => ({ ...current, job_id: String(jobs[0].id) }));
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await demandsApi.createDemand({
        ...(reuseProfile
          ? { job_id: Number(form.job_id) }
          : {
              job_title: form.job_title.trim(),
              jd_text: form.jd_text.trim(),
              job_department: form.requester_department.trim(),
            }),
        request_no: form.request_no.trim(),
        requester_name: form.requester_name.trim(),
        requester_department: form.requester_department.trim(),
        hiring_manager_name: form.hiring_manager_name.trim(),
        requested_at: form.requested_at,
        accepted_at: form.accepted_at,
        target_date: form.target_date,
        priority: form.priority,
        headcount: Number(form.headcount || 1),
        status: 'active',
        note: form.note.trim(),
      });
      setMessage('需求已创建');
      setForm((current) => ({
        ...EMPTY_FORM,
        job_id: reuseProfile ? current.job_id : '',
      }));
      demandsAsync.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建需求失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openDemandAction(mode: DemandActionMode, demand: RecruitmentDemand) {
    setAction({ mode, demand });
    setActionReason('');
    setActionPriority(demand.priority);
  }

  function closeDemandAction() {
    if (busyId !== null) return;
    setAction(null);
    setActionReason('');
  }

  async function submitDemandAction() {
    if (!action) return;
    const reason = actionReason.trim();
    if (!reason) {
      setMessage('请填写原因');
      return;
    }
    const { mode, demand } = action;
    if (mode === 'priority' && actionPriority === demand.priority) {
      setMessage('请选择不同的优先级');
      return;
    }
    setBusyId(demand.id);
    setMessage(null);
    try {
      if (mode === 'close') {
        await demandsApi.closeDemand(demand.id, {
          status: 'cancelled',
          close_reason: reason,
        });
        setMessage('需求已关闭');
      } else if (mode === 'restore') {
        await demandsApi.restoreDemand(demand.id, { note: reason });
        setMessage('需求已恢复，岗位画像也会恢复为在招');
      } else {
        const nextNote = [
          demand.note,
          `优先级调整：${PRIORITY_LABELS[demand.priority]} → ${PRIORITY_LABELS[actionPriority]}，${reason}`,
        ]
          .filter(Boolean)
          .join('\n');
        await demandsApi.updateDemand(demand.id, {
          priority: actionPriority,
          note: nextNote,
        });
        setMessage(`需求优先级已调整为 ${PRIORITY_LABELS[actionPriority]}`);
      }
      setAction(null);
      setActionReason('');
      demandsAsync.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '需求操作失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="招聘管理"
        description="招聘需求是主线，岗位画像用于匹配候选人和沉淀流程数据"
      />

      <RecruitmentManagementTabs />

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>新建招聘需求</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              {!reuseProfile && (
                <>
                  <Input
                    label="招聘岗位"
                    placeholder="例：Java 后端工程师"
                    value={form.job_title}
                    onChange={(event) => updateField('job_title', event.target.value)}
                  />
                  <label className="block lg:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      岗位职责/任职要求
                    </span>
                    <textarea
                      value={form.jd_text}
                      onChange={(event) => updateField('jd_text', event.target.value)}
                      placeholder="写清职责、核心技能、经验要求和加分项，系统会把它作为候选人匹配画像。"
                      className="min-h-[96px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                    />
                  </label>
                </>
              )}
                <Input
                  label="需求编号"
                  placeholder="例：REQ-2026-001"
                  value={form.request_no}
                  onChange={(event) => updateField('request_no', event.target.value)}
                />
                <Input
                  label="用人部门"
                  placeholder="例：科技部"
                  value={form.requester_department}
                  onChange={(event) => updateField('requester_department', event.target.value)}
                />
                <Input
                  label="需求发起人"
                  placeholder="例：宋总"
                  value={form.requester_name}
                  onChange={(event) => updateField('requester_name', event.target.value)}
                />
                <Input
                  label="用人负责人"
                  placeholder="例：产品负责人"
                  value={form.hiring_manager_name}
                  onChange={(event) => updateField('hiring_manager_name', event.target.value)}
                />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">优先级</span>
                  <select
                    value={form.priority}
                    onChange={(event) => updateField('priority', event.target.value as DemandPriority)}
                    className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                  >
                    <option value="A">A 级</option>
                    <option value="B">B 级</option>
                    <option value="C">C 级</option>
                  </select>
                </label>
                <Input
                  label="业务提需求时间"
                  type="date"
                  value={form.requested_at}
                  onChange={(event) => updateField('requested_at', event.target.value)}
                />
                <Input
                  label="HR 接手时间"
                  type="date"
                  value={form.accepted_at}
                  onChange={(event) => updateField('accepted_at', event.target.value)}
                />
                <Input
                  label="期望完成时间"
                  type="date"
                  value={form.target_date}
                  onChange={(event) => updateField('target_date', event.target.value)}
                />
                <Input
                  label="需求人数"
                  type="number"
                  min={1}
                  value={form.headcount}
                  onChange={(event) => updateField('headcount', event.target.value)}
                />
              </div>

              <details className="rounded-md border border-hairline bg-surface-soft px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  复用已有岗位画像
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="flex items-start gap-2 text-sm text-body">
                    <input
                      type="checkbox"
                      checked={reuseProfile}
                      onChange={(event) => handleReuseProfileChange(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-hairline"
                    />
                    <span>这次需求和已有岗位要求基本一致，直接复用该画像做候选人匹配。</span>
                  </label>
                  {reuseProfile && (
                    jobsAsync.loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Spinner size="sm" />
                        加载岗位画像…
                      </div>
                    ) : jobsAsync.error ? (
                      <ErrorState message={jobsAsync.error.message} onRetry={jobsAsync.reload} />
                    ) : jobs.length === 0 ? (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-muted">
                        <span>暂无可复用画像，请直接填写招聘岗位和任职要求。</span>
                        <Link to="/jobs">
                          <Button variant="secondary" size="sm">
                            查看岗位库
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-medium text-ink">
                          选择岗位画像
                        </span>
                        <select
                          value={form.job_id}
                          onChange={(event) => updateField('job_id', event.target.value)}
                          className="h-10 w-full rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                        >
                          {jobs.map((job) => (
                            <option key={job.id} value={job.id}>
                              {formatJobOption(job)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  )}
                </div>
              </details>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">备注</span>
                <textarea
                  value={form.note}
                  onChange={(event) => updateField('note', event.target.value)}
                  placeholder="记录业务背景、风险点或当前沟通结论"
                  className="min-h-[88px] w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
              </label>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={handleCreate} loading={submitting} disabled={!canCreate}>
                  创建需求
                </Button>
                <span className="text-xs text-muted-soft">
                  创建后会生成或复用岗位画像，用来匹配候选人并判断 HR 和业务侧卡点。
                </span>
              </div>
            </>
        </CardBody>
      </Card>

      {message && (
        <div className="rounded-md border border-hairline bg-surface-soft px-4 py-2 text-sm text-body">
          {message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-ink">需求列表</h2>
            <p className="mt-1 text-sm text-muted">
              当前活跃 {activeDemands.length} 个 / 总计 {demands.length} 个
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={demandsAsync.reload}>
            刷新
          </Button>
        </div>

        {demandsAsync.loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : demandsAsync.error ? (
          <ErrorState message={demandsAsync.error.message} onRetry={demandsAsync.reload} />
        ) : demands.length === 0 ? (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="暂无招聘需求"
              description="先登记一个真实业务需求，再用流程数据判断卡点"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {demands.map((demand) => (
              <DemandCard
                key={demand.id}
                demand={demand}
                busy={busyId === demand.id}
                onClose={(item) => openDemandAction('close', item)}
                onRestore={(item) => openDemandAction('restore', item)}
                onAdjustPriority={(item) => openDemandAction('priority', item)}
              />
            ))}
          </div>
        )}
      </section>

      <DemandActionDialog
        action={action}
        reason={actionReason}
        priority={actionPriority}
        busy={busyId !== null}
        onReasonChange={setActionReason}
        onPriorityChange={setActionPriority}
        onCancel={closeDemandAction}
        onConfirm={submitDemandAction}
      />
    </div>
  );
}
