// 工作台 — 登录后的角色化默认落地页。
// 欢迎横幅 + KPI 统计 + 功能入口宫格 + 角色引导，按角色差异化呈现。
// 复用 motion 基建（Reveal / AnimatedNumber）与 UI 基元，Cal.com 近黑单色风格，动效克制精致。

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
// 集中定义每个角色的展示标签、一句话职责、点睛图标、点缀色与主引导动作。

interface RoleInfo {
  label: string;
  duty: string;
  icon: LucideIcon;
  /** 点缀色（克制使用，仅用于图标底色等点睛处）。 */
  accent: string;
  /** 角色主引导动作。 */
  action: { to: string; label: string };
}

const ROLE_INFO: Record<Role, RoleInfo> = {
  recruiter: {
    label: '招聘专员',
    duty: '管理候选人简历、创建岗位，运行智能匹配与 AI 面试',
    icon: UserCog,
    accent: 'bg-brand-50 text-ink',
    action: { to: '/upload', label: '上传简历' },
  },
  manager: {
    label: '经理',
    duty: '洞察团队招聘漏斗与专员效能，把控招聘全局',
    icon: LineChart,
    accent: 'bg-brand-50 text-ink',
    action: { to: '/bi', label: '查看数据看板' },
  },
  admin: {
    label: '管理员',
    duty: '系统全量管理与团队效能监控，统筹整体运转',
    icon: ShieldCheck,
    accent: 'bg-brand-50 text-ink',
    action: { to: '/bi', label: '查看数据看板' },
  },
  interviewer: {
    label: '面试官',
    duty: '查看候选人与招聘流程，参与面试评估',
    icon: ClipboardCheck,
    accent: 'bg-brand-50 text-ink',
    action: { to: '/candidates', label: '查看候选人' },
  },
};

// ─── 功能入口描述 ─────────────────────────────────────────────────────────────
// 按路由为侧边栏功能补充一句话说明，宫格据此呈现指引。

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

// 按角色拉取 KPI 数据。candidates / jobs 所有角色都取；
// biOverview 仅 manager / admin 调用（recruiter / interviewer 调用会 403）。
// 用 allSettled 隔离单点失败：某个 KPI 拿不到就保持 null，不影响其余展示，整页不崩。
function useDashboardStats(role: Role | null): { stats: DashboardStats; loading: boolean } {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role) return;
    let active = true;
    setLoading(true);

    const wantsBi = role === 'manager' || role === 'admin';

    const candidatesP = api.listCandidates();
    const jobsP = api.listJobs();
    const biP = wantsBi ? api.biOverview() : Promise.resolve(null);

    Promise.allSettled([candidatesP, jobsP, biP]).then(
      ([candidatesR, jobsR, biR]) => {
        if (!active) return;
        const next: DashboardStats = { ...EMPTY_STATS };
        if (candidatesR.status === 'fulfilled') next.candidates = candidatesR.value.length;
        if (jobsR.status === 'fulfilled') next.jobs = jobsR.value.length;
        if (biR.status === 'fulfilled' && biR.value) {
          const f = biR.value.funnel;
          next.interview = f.interview ?? 0;
          next.onboarded = f.onboarded ?? 0;
          next.conversionRate = Number.isFinite(f.conversion_rate) ? f.conversion_rate : 0;
        }
        setStats(next);
        setLoading(false);
      }
    );

    return () => {
      active = false;
    };
  }, [role]);

  return { stats, loading };
}

// ─── 子组件 ───────────────────────────────────────────────────────────────────

// KPI 统计卡 — 数字用 AnimatedNumber 从 0 滚动到目标值。
// 值为 null（未取到 / 无权限）时显示占位「—」，不滚动。
function KpiCard({
  label,
  value,
  decimals = 0,
  suffix = '',
}: {
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <Card className="px-5 py-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 font-display text-3xl text-ink tabular-nums">
        {value === null ? (
          <span className="text-muted-soft">—</span>
        ) : (
          <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
        )}
      </div>
    </Card>
  );
}

// 功能入口大卡 — 整卡可点，跳转到对应路由；hover 轻微浮起，图标微动。
function FeatureCard({
  to,
  label,
  desc,
  icon: Icon,
}: {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}) {
  return (
    <Link to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg">
      <Card className="h-full px-5 py-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-card-hover group-hover:border-surface-strong">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-card text-ink transition-transform duration-300 group-hover:-translate-y-0.5">
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink">{label}</span>
              <ArrowRight className="h-4 w-4 text-muted-soft transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-ink" />
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
  const { name, role } = useAuth();
  const { stats } = useDashboardStats(role);

  if (!role) return null;

  const info = ROLE_INFO[role];
  const RoleIcon = info.icon;
  const wantsBi = role === 'manager' || role === 'admin';

  // 功能宫格：复用 navItemsForRole，剔除工作台自身（/）。
  const features = navItemsForRole(role).filter((item) => item.to !== '/');

  return (
    <div className="space-y-8">
      {/* A. 角色欢迎横幅 */}
      <Reveal as="section" y={12} stagger={0.1}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${info.accent}`}>
              <RoleIcon className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-display text-3xl leading-tight text-ink">
                欢迎回来，{name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{info.label}</Badge>
                <p className="text-sm text-muted">{info.duty}</p>
              </div>
            </div>
          </div>
          <Link
            to={info.action.to}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-brand-600 px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
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
          <KpiCard label="候选人总数" value={stats.candidates} />
          <KpiCard label="岗位总数" value={stats.jobs} />
          {wantsBi && <KpiCard label="面试中" value={stats.interview} />}
          {wantsBi && (
            <KpiCard label="转化率" value={stats.conversionRate} decimals={1} suffix="%" />
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
          {features.map((item) => (
            <FeatureCard
              key={item.to}
              to={item.to}
              label={item.label}
              desc={FEATURE_DESC[item.to] ?? ''}
              icon={item.icon}
            />
          ))}
        </Reveal>
      </section>
    </div>
  );
}
