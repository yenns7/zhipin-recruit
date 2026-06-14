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
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { navItemsForRole } from '../lib/nav';
import { Badge, Card } from '../components/ui';
import { Reveal, AnimatedNumber } from '../components/motion';
import type { Role } from '../types';

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
    duty: '管理候选人简历、创建岗位，运行智能匹配与 AI 面试',
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
    duty: '查看候选人与招聘流程，参与面试评估',
    icon: ClipboardCheck,
    accent: 'bg-teal-50 text-teal-700',
    gradient: 'linear-gradient(135deg, #5AC8FA, #34C759)',
    action: { to: '/candidates', label: '查看候选人' },
  },
};

// ─── 功能入口描述 ─────────────────────────────────────────────────────────────

const FEATURE_DESC: Record<string, string> = {
  '/agent': '用自然语言完成招聘操作，智能问答与建议',
  '/candidates': '浏览简历库，查看候选人档案与技能标签',
  '/upload': '批量上传简历，自动解析为结构化信息',
  '/jobs': '创建岗位、维护 JD，运行候选人智能匹配',
  '/pipeline': '看板式追踪候选人在各阶段的流转',
  '/interviews': '生成面试题、记录问答并获取 AI 评估',
  '/bi': '洞察招聘漏斗与专员效能，把控全局',
};

// ─── KPI 数据 ─────────────────────────────────────────────────────────────────

interface DashboardStats {
  candidates: number | null;
  jobs: number | null;
  interview: number | null;
  onboarded: number | null;
  conversionRate: number | null;
}

const EMPTY_STATS: DashboardStats = {
  candidates: null,
  jobs: null,
  interview: null,
  onboarded: null,
  conversionRate: null,
};

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
    const wantsOwnBi = (role === 'recruiter' || role === 'interviewer') && userId != null;

    const candidatesP = api.listCandidates();
    const jobsP = api.listJobs();
    const biP = wantsTeamBi
      ? api.biOverview()
      : wantsOwnBi
        ? api.biStaff(userId as number)
        : Promise.resolve(null);

    Promise.allSettled([candidatesP, jobsP, biP]).then(
      ([candidatesR, jobsR, biR]) => {
        if (!active) return;
        const next: DashboardStats = { ...EMPTY_STATS };
        if (candidatesR.status === 'fulfilled') next.candidates = candidatesR.value.length;
        if (jobsR.status === 'fulfilled') next.jobs = jobsR.value.length;
        if (biR.status === 'fulfilled' && biR.value) {
          const f = biR.value.funnel;
          next.interview =
            (f.interview_first ?? 0) + (f.interview_second ?? 0) + (f.interview_final ?? 0);
          next.onboarded = f.onboarded ?? 0;
          next.conversionRate = Number.isFinite(f.conversion_rate) ? f.conversion_rate : 0;
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
  const showFunnelKpis = role === 'manager' || role === 'admin' || userId != null;

  const features = navItemsForRole(role).filter((item) => item.to !== '/');

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
          <KpiCard label="候选人总数" value={stats.candidates} accent="#007AFF" />
          <KpiCard label="岗位总数" value={stats.jobs} accent="#5856D6" />
          {showFunnelKpis && <KpiCard label="面试中" value={stats.interview} accent="#FF9500" />}
          {showFunnelKpis && (
            <KpiCard label="转化率" value={stats.conversionRate} decimals={1} suffix="%" accent="#34C759" />
          )}
        </Reveal>
      </section>

      {/* C. 功能入口宫格 */}
      <section>
        <h2 className="mb-4 font-display text-lg text-ink">快速进入</h2>
        <Reveal
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          stagger={0.06}
          y={16}
        >
          {features.map((item, i) => {
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
                desc={FEATURE_DESC[item.to] ?? ''}
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