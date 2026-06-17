import { useEffect, useMemo, useState } from 'react';
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

interface DemandFormState {
  job_id: string;
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
      description: `已有 ${demand.metrics.recommended_count} 位候选人进入该岗位流程`,
      tone: 'success',
    };
  }

  return {
    title: '待启动',
    description: '还没有候选人进入该需求对应的岗位流程',
    tone: 'neutral',
  };
}

function DemandCard({
  demand,
  busy,
  onClose,
  onDowngrade,
}: {
  demand: RecruitmentDemand;
  busy: boolean;
  onClose: (demand: RecruitmentDemand) => void;
  onDowngrade: (demand: RecruitmentDemand) => void;
}) {
  const insight = demandInsight(demand);
  const stageItems = stageDistributionItems(demand);

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
              to={`/pipeline?job=${demand.job_id}`}
              className="inline-flex h-8 items-center rounded-md border border-hairline px-3 text-sm font-semibold text-ink hover:bg-surface-soft"
            >
              查看流程
            </Link>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onDowngrade(demand)}
            >
              降级
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => onClose(demand)}
            >
              关闭需求
            </Button>
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

export function DemandsPage() {
  const demandsAsync = useAsync(() => demandsApi.listDemands(), []);
  const jobsAsync = useAsync(() => api.listJobs(), []);
  const [form, setForm] = useState<DemandFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const jobs = jobsAsync.data ?? [];
  const demands = demandsAsync.data ?? [];
  const canCreate = jobs.length > 0 && form.job_id && !submitting;

  const activeDemands = useMemo(
    () => demands.filter((item) => item.status !== 'filled' && item.status !== 'cancelled'),
    [demands],
  );

  useEffect(() => {
    if (!form.job_id && jobs.length > 0) {
      setForm((current) => ({ ...current, job_id: String(jobs[0].id) }));
    }
  }, [form.job_id, jobs]);

  function updateField<K extends keyof DemandFormState>(key: K, value: DemandFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate() {
    if (!canCreate) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await demandsApi.createDemand({
        job_id: Number(form.job_id),
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
      setForm((current) => ({ ...EMPTY_FORM, job_id: current.job_id }));
      demandsAsync.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '创建需求失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose(demand: RecruitmentDemand) {
    const reason = window.prompt('关闭原因（例如：业务取消、长期无反馈、需求不真实）') ?? '';
    if (!reason.trim()) return;
    setBusyId(demand.id);
    setMessage(null);
    try {
      await demandsApi.closeDemand(demand.id, {
        status: 'cancelled',
        close_reason: reason.trim(),
      });
      setMessage('需求已关闭');
      demandsAsync.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '关闭需求失败');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDowngrade(demand: RecruitmentDemand) {
    const reason = window.prompt('降级原因（例如：业务反馈慢、薪资画像不匹配）') ?? '';
    if (!reason.trim()) return;
    const nextPriority: DemandPriority = demand.priority === 'A' ? 'B' : 'C';
    setBusyId(demand.id);
    setMessage(null);
    try {
      await demandsApi.downgradeDemand(demand.id, {
        priority: nextPriority,
        downgrade_reason: reason.trim(),
      });
      setMessage(`需求已降级为 ${PRIORITY_LABELS[nextPriority]}`);
      demandsAsync.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '降级失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="招聘管理"
        description="先确认用人需求，再维护岗位画像，并用流程数据判断招聘卡点"
      />

      <RecruitmentManagementTabs />

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>新建招聘需求</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {jobsAsync.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              加载岗位列表…
            </div>
          ) : jobsAsync.error ? (
            <ErrorState message={jobsAsync.error.message} onRetry={jobsAsync.reload} />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="暂无可关联岗位"
              description="请先创建岗位画像，再登记招聘需求"
            />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">关联岗位</span>
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
                  创建后会自动读取该岗位的流程数据，用来判断 HR 和业务侧卡点。
                </span>
              </div>
            </>
          )}
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
                onClose={handleClose}
                onDowngrade={handleDowngrade}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
