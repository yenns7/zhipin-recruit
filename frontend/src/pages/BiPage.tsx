// BI看板 — Apple Health/Fitness 风格数据看板。
// 毛玻璃 KPI 卡片、渐变漏斗、光环仪表、GSAP 增强动效。

import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  SegmentedControl,
  Spinner,
  PageHeader,
} from '../components/ui';
import type { BiFunnel, BiStaffMember } from '../types';
import type { ReactNode } from 'react';
import { Reveal, AnimatedNumber } from '../components/motion';
import { FunnelDiagram, ConversionRing } from '../components/bi/BiVisuals';

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

// 漏斗展示的 5 个概念阶段。面试阶段在后端已拆为一面/二面/终面三轮，
// 这里用 value(funnel) 取值，"面试"行把三轮合并求和。
const FUNNEL_STAGES: { label: string; value: (f: BiFunnel) => number }[] = [
  { label: '待筛选', value: (f) => safeNum(f.pending) },
  { label: 'AI初筛', value: (f) => safeNum(f.ai_screen) },
  {
    label: '面试',
    value: (f) =>
      safeNum(f.interview_first) + safeNum(f.interview_second) + safeNum(f.interview_final),
  },
  { label: 'Offer', value: (f) => safeNum(f.offer) },
  { label: '已入职', value: (f) => safeNum(f.onboarded) },
];

// Apple 风格渐变配色
const FUNNEL_COLORS: string[] = [
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF9500',
  '#34C759',
];
const REJECTED_COLOR = '#FF3B30';

const BAR_COLOR_RESUMES = '#007AFF';
const BAR_COLOR_SCREENS = '#5856D6';
const BAR_COLOR_ONBOARDED = '#34C759';

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function safeNum(v: number | undefined): number {
  const n = v ?? 0;
  return Number.isFinite(n) ? n : 0;
}

function pct(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(1) + '%';
}

function teamAvgConversion(staff: BiStaffMember[]): number {
  if (staff.length === 0) return 0;
  const sum = staff.reduce((acc, s) => acc + safeNum(s.conversion_rate), 0);
  return sum / staff.length;
}

// ─── 子组件 ───────────────────────────────────────────────────────────────────

// Apple 风格 KPI 卡片
function KpiCard({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <Card variant="elevated" className="overflow-hidden">
      <CardBody className="relative">
        {accent && (
          <div
            className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-10"
            style={{ background: accent }}
          />
        )}
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">{label}</p>
        <p className="text-2xl font-display text-ink">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-soft">{sub}</p>}
      </CardBody>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'neutral' | 'danger' | 'warning' | 'success';
}) {
  const toneClass = {
    neutral: 'text-ink',
    danger: 'text-danger-700',
    warning: 'text-warning-700',
    success: 'text-success-700',
  }[tone];

  return (
    <div className="rounded-md border border-hairline bg-surface-soft px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-display ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-soft">{sub}</p>}
    </div>
  );
}

// 专员行内条形图
function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-surface-strong overflow-hidden min-w-0" style={{ minWidth: 40 }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-apple"
          style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}dd, ${color})` }}
        />
      </div>
      <span className="text-xs tabular-nums text-body shrink-0 w-6 text-right">{value}</span>
    </div>
  );
}

// 专员效能对比表
function StaffTable({
  staff,
  onSelect,
}: {
  staff: BiStaffMember[];
  onSelect: (hrId: number) => void;
}) {
  const maxResumes = Math.max(...staff.map((s) => safeNum(s.resumes)), 1);
  const maxScreens = Math.max(...staff.map((s) => safeNum(s.screens)), 1);
  const maxOnboarded = Math.max(...staff.map((s) => safeNum(s.onboarded)), 1);
  const avgConv = teamAvgConversion(staff);

  if (staff.length === 0) {
    return <p className="text-sm text-muted py-2">暂无专员数据</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="py-2.5 pr-4 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap">
              专员
            </th>
            <th className="py-2.5 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              简历量
            </th>
            <th className="py-2.5 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              初筛量
            </th>
            <th className="py-2.5 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              入职数
            </th>
            <th className="py-2.5 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap">
              转化率
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.05} y={10}>
          {staff.map((s) => {
            const conv = safeNum(s.conversion_rate);
            const aboveAvg = conv > avgConv;
            const atAvg = conv === avgConv;
            const convColor = aboveAvg ? '#34C759' : atAvg ? '#111111' : '#FF3B30';
            return (
              <tr
                key={s.hr_id}
                className="border-b border-hairline-soft transition-all duration-200 hover:bg-surface-soft hover:shadow-apple-sm cursor-pointer"
                onClick={() => onSelect(s.hr_id)}
                tabIndex={0}
                role="button"
                aria-label={`查看 ${s.name} 的详情`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(s.hr_id);
                }}
              >
                <td className="py-3 pr-4 font-medium text-ink whitespace-nowrap">
                  {s.name}
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.resumes)} max={maxResumes} color={BAR_COLOR_RESUMES} />
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.screens)} max={maxScreens} color={BAR_COLOR_SCREENS} />
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.onboarded)} max={maxOnboarded} color={BAR_COLOR_ONBOARDED} />
                </td>
                <td className="py-3">
                  <span
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: convColor }}
                  >
                    {pct(conv)}
                  </span>
                </td>
              </tr>
            );
          })}
        </Reveal>
      </table>
      <p className="mt-2 text-xs text-muted-soft">点击专员行可查看其漏斗详情</p>
    </div>
  );
}

// ─── 第一层 — 团队总览 ────────────────────────────────────────────────────────

function TeamOverview({
  days,
  onDaysChange,
}: {
  days: number;
  onDaysChange: (d: number) => void;
}) {
  const { data, loading, error, reload } = useAsync(
    () => api.biOverview(days),
    [days],
  );

  const [selectedHrId, setSelectedHrId] = useState<number | null>(null);

  if (selectedHrId !== null) {
    const staffMember = data?.staff.find((s) => s.hr_id === selectedHrId) ?? null;
    const avgConv = data ? teamAvgConversion(data.staff) : null;
    return (
      <StaffDrilldown
        hrId={selectedHrId}
        days={days}
        staffMember={staffMember}
        teamAvgConv={avgConv}
        onBack={() => setSelectedHrId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="数据看板"
        description="团队招聘漏斗与专员效能对比"
        actions={
          <SegmentedControl<number>
            options={DAYS_OPTIONS}
            value={days}
            onChange={onDaysChange}
            size="sm"
          />
        }
      />

      {loading && (
        <div className="flex items-center justify-center py-32">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error.message}
          <button onClick={reload} className="ml-3 font-medium underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* KPI 指标行 — Apple 风格毛玻璃卡片 */}
          <Reveal as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.07}>
            <KpiCard
              label="在招专员"
              value={<AnimatedNumber value={data.staff.length} />}
              sub="本期活跃"
              accent="#007AFF"
            />
            <KpiCard
              label="本期入职"
              value={<AnimatedNumber value={safeNum(data.funnel.onboarded)} />}
              sub="已入职人数"
              accent="#34C759"
            />
            <KpiCard
              label="流程内入职占比"
              value={<AnimatedNumber value={safeNum(data.funnel.conversion_rate)} decimals={1} suffix="%" />}
              sub="当前流程人数口径"
              accent="#AF52DE"
            />
            <KpiCard
              label="当前流程人数"
              value={<AnimatedNumber value={safeNum(data.funnel.pipeline_total)} />}
              sub="按当前阶段去重"
              accent="#FF9500"
            />
          </Reveal>

          <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-2" stagger={0.08} y={16}>
            <Card variant="elevated">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>需求健康</CardTitle>
                  <Badge tone="neutral">
                    A/B/C {safeNum(data.demands.priority_counts.A)} / {safeNum(data.demands.priority_counts.B)} / {safeNum(data.demands.priority_counts.C)}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile
                    label="活跃需求"
                    value={<AnimatedNumber value={data.demands.active_total} />}
                    sub="待处理与招聘中"
                  />
                  <MetricTile
                    label="逾期需求"
                    value={<AnimatedNumber value={data.demands.overdue} />}
                    sub="超过目标日期"
                    tone={data.demands.overdue > 0 ? 'danger' : 'success'}
                  />
                  <MetricTile
                    label="HR 无推荐"
                    value={<AnimatedNumber value={data.demands.hr_no_recommendation} />}
                    sub="接手 7 天未推荐"
                    tone={data.demands.hr_no_recommendation > 0 ? 'warning' : 'success'}
                  />
                  <MetricTile
                    label="业务待反馈"
                    value={<AnimatedNumber value={data.demands.business_feedback_pending} />}
                    sub="卡在业务复核"
                    tone={data.demands.business_feedback_pending > 0 ? 'warning' : 'success'}
                  />
                </div>
              </CardBody>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>简历消化</CardTitle>
                  <Badge tone="neutral">
                    进流程 {pct(safeNum(data.resumes.pipeline_entry_rate))}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile
                    label="入库简历"
                    value={<AnimatedNumber value={data.resumes.total_candidates} />}
                    sub="当前周期"
                  />
                  <MetricTile
                    label="绑定岗位"
                    value={<AnimatedNumber value={data.resumes.linked_to_job} />}
                    sub={`${data.resumes.unassigned} 份暂未绑定`}
                  />
                  <MetricTile
                    label="已匹配"
                    value={<AnimatedNumber value={data.resumes.matched_candidates} />}
                    sub={`匹配率 ${pct(safeNum(data.resumes.match_rate))}`}
                  />
                  <MetricTile
                    label="已进流程"
                    value={<AnimatedNumber value={data.resumes.in_pipeline} />}
                    sub={`${data.resumes.not_in_pipeline} 份未进流程`}
                    tone={data.resumes.not_in_pipeline > 0 ? 'warning' : 'success'}
                  />
                  <MetricTile
                    label="进流程率"
                    value={
                      <AnimatedNumber
                        value={safeNum(data.resumes.pipeline_entry_rate)}
                        decimals={1}
                        suffix="%"
                      />
                    }
                    sub="入库到流程转化"
                    tone={data.resumes.pipeline_entry_rate > 0 ? 'success' : 'neutral'}
                  />
                </div>
              </CardBody>
            </Card>
          </Reveal>

          {/* 图表行 */}
          <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-2" stagger={0.1} y={20}>
            {/* 团队招聘漏斗 */}
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>团队当前阶段分布</CardTitle>
              </CardHeader>
              <CardBody>
                <FunnelDiagram
                  stages={FUNNEL_STAGES.map(({ label, value }, i) => ({
                    label,
                    value: value(data.funnel),
                    color: FUNNEL_COLORS[i] ?? '#007AFF',
                  }))}
                  rejected={safeNum(data.funnel.rejected)}
                  rejectedColor={REJECTED_COLOR}
                />
              </CardBody>
            </Card>

            {/* 转化率仪表 + 阶段汇总 */}
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>流程状态总览</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="mb-5 flex justify-center">
                  <ConversionRing
                    percent={safeNum(data.funnel.conversion_rate)}
                    label="流程内入职占比"
                    color="#007AFF"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {FUNNEL_STAGES.map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-surface-soft px-3 py-2.5 transition-colors hover:bg-surface-card">
                      <p className="text-xs text-muted mb-0.5">{label}</p>
                      <p className="text-lg font-display text-ink">
                        <AnimatedNumber value={value(data.funnel)} />
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </Reveal>

          {/* 专员效能对比 */}
          <Card variant="elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>专员效能对比</CardTitle>
                {data.staff.length > 0 && (
                  <Badge tone="neutral">团队均转化率 {pct(teamAvgConversion(data.staff))}</Badge>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {data.staff.length === 0 ? (
                <p className="text-sm text-muted">本期暂无专员数据</p>
              ) : (
                <StaffTable staff={data.staff} onSelect={setSelectedHrId} />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── 第二层 — 专员漏斗下钻 ────────────────────────────────────────────────────

function StaffDrilldown({
  hrId,
  days,
  staffMember,
  teamAvgConv,
  onBack,
}: {
  hrId: number;
  days: number;
  staffMember: BiStaffMember | null;
  teamAvgConv: number | null;
  onBack: () => void;
}) {
  const { data, loading, error, reload } = useAsync(
    () => api.biStaff(hrId, days),
    [hrId, days],
  );

  const name = staffMember?.name ?? `专员 #${hrId}`;
  const conv = staffMember ? safeNum(staffMember.conversion_rate) : null;
  const avg = teamAvgConv ?? 0;
  const aboveAvg = conv !== null && conv > avg;
  const atAvg = conv !== null && conv === avg;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Back navigation */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors duration-200 focus:outline-none focus-visible:underline"
      >
        ← 返回团队总览
      </button>

      {/* Staff header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-ink">{name}</h1>
          <p className="mt-0.5 text-sm text-muted">专员漏斗详情 · 近 {days} 天</p>
        </div>
        {conv !== null && teamAvgConv !== null && (
          <Badge tone={aboveAvg ? 'success' : atAvg ? 'neutral' : 'danger'}>
            转化率 {pct(conv)}{' '}
            {aboveAvg ? '▲ 高于' : atAvg ? '= ' : '▼ 低于'}团队均值 {pct(avg)}
          </Badge>
        )}
      </div>

      {/* Staff KPI cards */}
      {staffMember && (
        <Reveal as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.07}>
          <KpiCard label="简历量" value={<AnimatedNumber value={safeNum(staffMember.resumes)} />} accent="#007AFF" />
          <KpiCard label="初筛量" value={<AnimatedNumber value={safeNum(staffMember.screens)} />} accent="#5856D6" />
          <KpiCard label="入职数" value={<AnimatedNumber value={safeNum(staffMember.onboarded)} />} accent="#34C759" />
            <KpiCard label="入职占比" value={<AnimatedNumber value={safeNum(staffMember.conversion_rate)} decimals={1} suffix="%" />} accent="#AF52DE" />
        </Reveal>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error.message}
          <button onClick={reload} className="ml-3 font-medium underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>个人招聘漏斗</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <FunnelDiagram
                stages={FUNNEL_STAGES.map(({ label, value }, i) => ({
                  label,
                  value: value(data.funnel),
                  color: FUNNEL_COLORS[i] ?? '#007AFF',
                }))}
                rejected={safeNum(data.funnel.rejected)}
                rejectedColor={REJECTED_COLOR}
              />
              <div className="flex justify-center lg:px-4">
                <ConversionRing
                  percent={safeNum(data.funnel.conversion_rate)}
                  label="个人入职占比"
                  color="#007AFF"
                  size={160}
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FUNNEL_STAGES.map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-surface-soft px-3 py-2.5 transition-colors hover:bg-surface-card">
                  <p className="text-xs text-muted mb-0.5">{label}</p>
                  <p className="text-xl font-display text-ink">
                    <AnimatedNumber value={value(data.funnel)} />
                  </p>
                </div>
              ))}
              <div className="rounded-xl bg-danger-50 px-3 py-2.5">
                <p className="text-xs text-danger-600 mb-0.5">淘汰</p>
                <p className="text-xl font-display text-danger-700">
                  <AnimatedNumber value={safeNum(data.funnel.rejected)} />
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="pt-2">
        <Button variant="secondary" size="sm" onClick={onBack}>
          ← 返回团队总览
        </Button>
      </div>
    </div>
  );
}

// ─── 页面根组件 ────────────────────────────────────────────────────────────────

export function BiPage() {
  const [days, setDays] = useState<number>(30);

  return <TeamOverview days={days} onDaysChange={setDays} />;
}
