// 工作台 — 登录后的角色化默认落地页。
// Apple 风格：毛玻璃 KPI 卡片、渐变图标、弹簧动效。

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCog,
  LineChart,
  ShieldCheck,
  ClipboardCheck,
  ArrowRight,
  Upload,
  Briefcase,
  KanbanSquare,
  Bot,
  BarChart3,
  Settings,
  Sparkles,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Card } from '../components/ui';
import { Reveal, AnimatedNumber } from '../components/motion';
import type { BiManagerAlert, BiStaffMember, InterviewAssignment, Role } from '../types';

// ─── 角色信息 ─────────────────────────────────────────────────────────────────

interface RoleInfo {
  label: string;
  duty: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  action: { to: string; label: string };
}

const ROLE_INFO: Record<Role, RoleInfo> = {
  recruiter: {
    label: '招聘专员',
    duty: '管理候选人简历、创建岗位，运行智能匹配与预筛参考',
    icon: UserCog,
    accent: 'bg-blue-50 text-accent-blue',
    gradient: 'linear-gradient(135deg, #007AFF, #5856D6)',
    action: { to: '/upload', label: '上传简历' },
  },
  manager: {
    label: '经理',
    duty: '洞察团队招聘漏斗与专员效能，把控招聘全局',
    icon: LineChart,
    accent: 'bg-purple-50 text-accent-purple',
    gradient: 'linear-gradient(135deg, #AF52DE, #5856D6)',
    action: { to: '/bi', label: '查看数据看板' },
  },
  admin: {
    label: '管理员',
    duty: '系统全量管理与团队效能监控，统筹整体运转',
    icon: ShieldCheck,
    accent: 'bg-brand-50 text-ink',
    gradient: 'linear-gradient(135deg, #111111, #374151)',
    action: { to: '/bi', label: '查看数据看板' },
  },
  interviewer: {
    label: '面试官',
    duty: '处理分配给我的面试安排与反馈',
    icon: ClipboardCheck,
    accent: 'bg-teal-50 text-teal-700',
    gradient: 'linear-gradient(135deg, #5AC8FA, #34C759)',
    action: { to: '/interviews', label: '查看我的面试' },
  },
};

// ─── 角色常用动作 ─────────────────────────────────────────────────────────────

interface WorkflowAction {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  roles: Role[];
}

const WORKFLOW_ACTIONS: WorkflowAction[] = [
  {
    to: '/upload',
    label: '上传简历',
    desc: '把新候选人放进简历库，解析失败也能重试',
    icon: Upload,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/jobs',
    label: '选择岗位匹配',
    desc: '先选岗位，再运行候选人匹配并加入流程',
    icon: Briefcase,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/pipeline',
    label: '跟进候选人管道',
    desc: '推进初筛、面试、Offer、淘汰沉淀',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/interviews',
    label: '处理面试反馈',
    desc: '安排面试、填写反馈、查看面试记录',
    icon: Bot,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  {
    to: '/bi',
    label: '查看团队看板',
    desc: '看漏斗、转化率和专员效能',
    icon: BarChart3,
    roles: ['manager', 'admin'],
  },
  {
    to: '/agent',
    label: '问 AI 助手',
    desc: '用自然语言查询候选人、岗位和流程',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/admin/settings',
    label: '系统设置',
    desc: '管理账号、审计日志和 AI 助手边界',
    icon: Settings,
    roles: ['admin'],
  },
];

const ACTION_ORDER_BY_ROLE: Record<Role, string[]> = {
  recruiter: ['/upload', '/jobs', '/pipeline', '/interviews'],
  manager: ['/bi', '/pipeline', '/interviews', '/agent'],
  admin: ['/bi', '/admin/settings', '/interviews', '/agent'],
  interviewer: ['/interviews'],
};

function workflowActionsForRole(role: Role): WorkflowAction[] {
  const allowed = WORKFLOW_ACTIONS.filter((item) => item.roles.includes(role));
  return ACTION_ORDER_BY_ROLE[role]
    .map((to) => allowed.find((item) => item.to === to))
    .filter((item): item is WorkflowAction => Boolean(item));
}

// ─── KPI 数据 ─────────────────────────────────────────────────────────────────

interface DashboardStats {
  candidates: number | null;
  jobs: number | null;
  businessReview: number | null;
  interview: number | null;
  offer: number | null;
  onboarded: number | null;
  conversionRate: number | null;
  alerts: BiManagerAlert[];
  performance: BiStaffMember | null;
  interviewerTasks: InterviewerTaskStats;
}

interface InterviewerTaskStats {
  pendingFeedback: number | null;
  todayInterviews: number | null;
  submittedFeedback: number | null;
  overdueFeedback: number | null;
}

const EMPTY_STATS: DashboardStats = {
  candidates: null,
  jobs: null,
  businessReview: null,
  interview: null,
  offer: null,
  onboarded: null,
  conversionRate: null,
  alerts: [],
  performance: null,
  interviewerTasks: {
    pendingFeedback: null,
    todayInterviews: null,
    submittedFeedback: null,
    overdueFeedback: null,
  },
};

function isToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

function buildInterviewerTaskStats(assignments: InterviewAssignment[]): InterviewerTaskStats {
  return {
    pendingFeedback: assignments.filter((item) => !item.feedback_submitted).length,
    todayInterviews: assignments.filter((item) => isToday(item.scheduled_at)).length,
    submittedFeedback: assignments.filter((item) => item.feedback_submitted).length,
    overdueFeedback: assignments.filter((item) => item.is_overdue && !item.feedback_submitted).length,
  };
}

function useDashboardStats(
  role: Role | null,
  userId: number | null,
): { stats: DashboardStats; loading: boolean } {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role) return;
    let active = true;
    setLoading(true);

    const wantsTeamBi = role === 'manager' || role === 'admin';
    const wantsOwnBi = role === 'recruiter' && userId != null;
    const wantsInterviewTasks = role === 'interviewer';

    const candidatesP = wantsInterviewTasks ? Promise.resolve([]) : api.listCandidates();
    const jobsP = wantsInterviewTasks ? Promise.resolve([]) : api.listJobs();
    const biP = wantsTeamBi
      ? api.biOverview()
      : wantsOwnBi
        ? api.biStaff(userId as number)
        : Promise.resolve(null);
    const assignmentsP = wantsInterviewTasks
      ? api.listInterviewAssignments()
      : Promise.resolve([] as InterviewAssignment[]);

    Promise.allSettled([candidatesP, jobsP, biP, assignmentsP]).then(
      ([candidatesR, jobsR, biR, assignmentsR]) => {
        if (!active) return;
        const next: DashboardStats = { ...EMPTY_STATS };
        if (candidatesR.status === 'fulfilled') next.candidates = candidatesR.value.length;
        if (jobsR.status === 'fulfilled') next.jobs = jobsR.value.length;
        if (assignmentsR.status === 'fulfilled' && wantsInterviewTasks) {
          next.interviewerTasks = buildInterviewerTaskStats(assignmentsR.value);
        }
        if (biR.status === 'fulfilled' && biR.value) {
          const f = biR.value.funnel;
          next.businessReview = f.business_review ?? 0;
          next.interview = f.interview ?? 0;
          next.offer = f.offer ?? 0;
          next.onboarded = f.onboarded ?? 0;
          next.conversionRate = Number.isFinite(f.conversion_rate) ? f.conversion_rate : 0;
          if ('performance' in biR.value && biR.value.performance) {
            const p = biR.value.performance;
            next.performance = p;
            next.businessReview = p.business_review_entries;
            next.interview = p.interview_entries;
            next.offer = p.offer_entries;
            next.onboarded = p.onboarded;
            next.conversionRate = Number.isFinite(p.recommendation_to_onboard_rate)
              ? p.recommendation_to_onboard_rate
              : 0;
          }
          if ('alerts' in biR.value) next.alerts = biR.value.alerts ?? [];
        }
        setStats(next);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [role, userId]);

  return { stats, loading };
}

// ─── 子组件 ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  decimals = 0,
  suffix = '',
  accent,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  accent?: string;
}) {
  return (
    <Card variant="elevated" className="overflow-hidden">
      <div className="relative px-5 py-5">
        {accent && (
          <div
            className="absolute -right-3 -top-3 h-14 w-14 rounded-full opacity-8"
            style={{ background: accent }}
          />
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <div className="mt-2 font-display text-3xl text-ink tabular-nums">
          {value === null ? (
            <span className="text-muted-soft">—</span>
          ) : (
            <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
          )}
        </div>
      </div>
    </Card>
  );
}

function alertKindLabel(kind: string): string {
  if (kind === 'stale_pipeline') return '流程卡住';
  if (kind === 'pending_interview_feedback') return '反馈待补';
  if (kind === 'business_feedback_overdue') return '业务反馈超时';
  return '待处理';
}

function alertTone(priority: string): 'danger' | 'warning' | 'neutral' {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  return 'neutral';
}

function ManagementAlerts({ alerts }: { alerts: BiManagerAlert[] }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">管理提醒</h2>
          <p className="mt-1 text-sm text-muted">自动标出需要管理者关注的招聘卡点</p>
        </div>
        <Badge tone={alerts.length > 0 ? 'warning' : 'success'}>
          {alerts.length > 0 ? `${alerts.length} 项待处理` : '暂无明显卡点'}
        </Badge>
      </div>
      <Card variant="elevated" className="overflow-hidden">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
            <Clock3 className="h-4 w-4 text-success-600" />
            当前没有候选人长时间卡住，也没有逾期未填的面试反馈。
          </div>
        ) : (
          <div className="divide-y divide-hairline-soft">
            {alerts.slice(0, 4).map((alert) => (
              <Link
                key={`${alert.kind}-${alert.job_id}-${alert.candidate_id}-${alert.stage}`}
                to={alert.action_path}
                className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface-soft focus:outline-none focus-visible:bg-surface-soft"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{alert.title}</span>
                    <Badge tone={alertTone(alert.priority)}>{alertKindLabel(alert.kind)}</Badge>
                  </span>
                  <span className="mt-1 block text-sm text-muted">{alert.detail}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function RecruiterPerformancePanel({ performance }: { performance: BiStaffMember | null }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">我的本月业绩</h2>
          <p className="mt-1 text-sm text-muted">按当前账号归属统计，经理看板使用同一套口径</p>
        </div>
        <Badge tone="neutral">近 30 天</Badge>
      </div>
      <Reveal
        className="grid grid-cols-2 gap-4 lg:grid-cols-6"
        stagger={0.05}
        y={14}
      >
        <KpiCard
          label="有效推荐"
          value={valueOrNull(performance?.effective_recommendations)}
          accent="#FF9500"
        />
        <KpiCard
          label="推荐成功面试"
          value={valueOrNull(performance?.interview_entries)}
          accent="#007AFF"
        />
        <KpiCard
          label="面试通过"
          value={valueOrNull(performance?.interview_passed)}
          accent="#5856D6"
        />
        <KpiCard
          label="Offer"
          value={valueOrNull(performance?.offer_entries)}
          accent="#AF52DE"
        />
        <KpiCard
          label="已入职"
          value={valueOrNull(performance?.onboarded)}
          accent="#34C759"
        />
        <KpiCard
          label="待补反馈"
          value={valueOrNull(performance?.feedback_pending)}
          accent="#FF3B30"
        />
      </Reveal>
    </section>
  );
}

function TodoCard({
  to,
  label,
  value,
  desc,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  value: number | null;
  desc: string;
  icon: LucideIcon;
  tone: 'neutral' | 'warning' | 'success';
}) {
  const toneClass = {
    neutral: 'bg-surface-soft text-muted',
    warning: 'bg-warning-50 text-warning-700',
    success: 'bg-success-50 text-success-700',
  }[tone];

  return (
    <Link
      to={to}
      className="group block rounded-apple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-3 px-5 py-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{label}</span>
              <span className="font-display text-xl tabular-nums text-ink">
                {value === null ? '—' : <AnimatedNumber value={value} />}
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted">{desc}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </Card>
    </Link>
  );
}

function RecruiterTodoPanel({ stats }: { stats: DashboardStats }) {
  const feedbackPending = valueOrNull(stats.performance?.feedback_pending);
  const businessReview = valueOrNull(stats.performance?.business_review_entries ?? stats.businessReview);
  const interview = valueOrNull(stats.performance?.interview_entries ?? stats.interview);
  const offer = valueOrNull(stats.performance?.offer_entries ?? stats.offer);

  return (
    <section>
      <h2 className="mb-4 font-display text-lg text-ink">今日待办</h2>
      <Reveal
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        stagger={0.05}
        y={14}
      >
        <TodoCard
          to="/pipeline"
          label="业务待反馈"
          value={businessReview}
          desc="推动用人部门确认"
          icon={Inbox}
          tone={businessReview && businessReview > 0 ? 'warning' : 'success'}
        />
        <TodoCard
          to="/pipeline"
          label="面试中跟进"
          value={interview}
          desc="关注候选人当前进展"
          icon={KanbanSquare}
          tone={interview && interview > 0 ? 'neutral' : 'success'}
        />
        <TodoCard
          to="/interviews"
          label="待补反馈"
          value={feedbackPending}
          desc="催补面试结论"
          icon={Clock3}
          tone={feedbackPending && feedbackPending > 0 ? 'warning' : 'success'}
        />
        <TodoCard
          to="/pipeline"
          label="Offer跟进"
          value={offer}
          desc="跟进发放与入职"
          icon={CheckCircle2}
          tone={offer && offer > 0 ? 'neutral' : 'success'}
        />
      </Reveal>
    </section>
  );
}

function FeatureCard({
  to,
  label,
  desc,
  icon: Icon,
  gradient,
}: {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  gradient: string;
}) {
  return (
    <Link
      to={to}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-apple"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-4 px-5 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110"
            style={{ background: gradient }}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink">{label}</span>
              <ArrowRight className="h-4 w-4 text-muted-soft transition-all duration-300 group-hover:translate-x-1 group-hover:text-ink" />
            </div>
            <p className="mt-1 text-sm text-muted">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ─── 页面 ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { name, role, userId } = useAuth();
  const { stats } = useDashboardStats(role, userId);

  if (!role) return null;

  const info = ROLE_INFO[role];
  const RoleIcon = info.icon;
  const showFunnelKpis = role === 'manager' || role === 'admin' || role === 'recruiter';
  const showManagementAlerts = role === 'manager' || role === 'admin';
  const showRecruiterPanels = role === 'recruiter';
  const showInterviewerKpis = role === 'interviewer';

  const actions = workflowActionsForRole(role);

  return (
    <div className="space-y-8">
      {/* A. 角色欢迎横幅 */}
      <Reveal as="section" y={12} stagger={0.1}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-apple-md"
              style={{ background: info.gradient }}
            >
              <RoleIcon className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-display text-3xl leading-tight text-ink">
                欢迎回来，{name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="glass">{info.label}</Badge>
                <p className="text-sm text-muted">{info.duty}</p>
              </div>
            </div>
          </div>
          <Link
            to={info.action.to}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 shadow-apple-sm"
            style={{ background: info.gradient }}
          >
            {info.action.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>

      {/* B. KPI 统计卡片区 */}
      <section>
        <Reveal
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          stagger={0.07}
          y={16}
        >
          {showInterviewerKpis ? (
            <>
              <KpiCard
                label="待我反馈"
                value={stats.interviewerTasks.pendingFeedback}
                accent="#FF9500"
              />
              <KpiCard
                label="今日面试"
                value={stats.interviewerTasks.todayInterviews}
                accent="#007AFF"
              />
              <KpiCard
                label="已反馈"
                value={stats.interviewerTasks.submittedFeedback}
                accent="#34C759"
              />
              <KpiCard
                label="超时待反馈"
                value={stats.interviewerTasks.overdueFeedback}
                accent="#FF3B30"
              />
            </>
          ) : (
            <>
              <KpiCard label="候选人总数" value={stats.candidates} accent="#007AFF" />
              <KpiCard label="岗位总数" value={stats.jobs} accent="#5856D6" />
              {showFunnelKpis && <KpiCard label="面试中" value={stats.interview} accent="#FF9500" />}
              {showFunnelKpis && (
                <KpiCard label="转化率" value={stats.conversionRate} decimals={1} suffix="%" accent="#34C759" />
              )}
            </>
          )}
        </Reveal>
      </section>

      {showManagementAlerts && <ManagementAlerts alerts={stats.alerts} />}

      {showRecruiterPanels && <RecruiterPerformancePanel performance={stats.performance} />}

      {showRecruiterPanels && <RecruiterTodoPanel stats={stats} />}

      {/* C. 常用动作 */}
      <section>
        <h2 className="mb-4 font-display text-lg text-ink">常用动作</h2>
        <Reveal
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          stagger={0.06}
          y={16}
        >
          {actions.map((item, i) => {
            const gradients = [
              'linear-gradient(135deg, #007AFF, #5856D6)',
              'linear-gradient(135deg, #AF52DE, #FF2D55)',
              'linear-gradient(135deg, #FF9500, #FF2D55)',
              'linear-gradient(135deg, #34C759, #5AC8FA)',
              'linear-gradient(135deg, #5856D6, #AF52DE)',
              'linear-gradient(135deg, #007AFF, #34C759)',
            ];
            return (
              <FeatureCard
                key={item.to}
                to={item.to}
                label={item.label}
                desc={item.desc}
                icon={item.icon}
                gradient={gradients[i % gradients.length]}
              />
            );
          })}
        </Reveal>
      </section>
    </div>
  );
}
