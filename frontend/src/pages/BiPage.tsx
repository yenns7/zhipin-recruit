// BI看板 — 团队整体漏斗 + 专员绩效对比（仅限经理/管理员）
// 第一层: 团队总览（KPI、漏斗、专员对比）
// 第二层: 单个专员漏斗下钻（点击专员行进入）
// 第三层 (单职位候选人分布) 后端 /bi/job/{id} 本版本未实现，不在此页构建。

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

// 漏斗阶段（按流程顺序，淘汰单独展示）
const FUNNEL_STAGES: { key: keyof Omit<BiFunnel, 'conversion_rate' | 'rejected'>; label: string }[] = [
  { key: 'pending', label: '待筛选' },
  { key: 'ai_screen', label: 'AI初筛' },
  { key: 'interview', label: '面试' },
  { key: 'offer', label: 'Offer' },
  { key: 'onboarded', label: '已入职' },
];

// Cal.com 配色：近黑→中性灰阶梯（体现漏斗收窄），不使用靛蓝/紫
const FUNNEL_COLORS: string[] = [
  '#111111', // 待筛选：近黑
  '#374151', // AI初筛：深灰
  '#6b7280', // 面试：中灰
  '#898989', // Offer：浅中灰
  '#10b981', // 已入职：成功绿（克制使用，语义清晰）
];
const REJECTED_COLOR = '#ef4444'; // 淘汰：danger 红

// 专员对比条形图颜色
const BAR_COLOR_RESUMES = '#111111';   // 简历量：近黑
const BAR_COLOR_SCREENS = '#374151';   // 初筛量：深灰
const BAR_COLOR_ONBOARDED = '#10b981'; // 入职数：成功绿

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

// KPI 卡片 — 单指标磁贴
function KpiCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-display text-ink">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-soft">{sub}</p>}
      </CardBody>
    </Card>
  );
}

// 专员行内条形图
function InlineBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-2 rounded-full bg-surface-strong overflow-hidden min-w-0" style={{ minWidth: 40 }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${width}%`, background: color }}
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
          <tr className="border-b border-hairline bg-surface-soft">
            <th className="py-2 pr-4 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap">
              专员
            </th>
            <th className="py-2 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              简历量
            </th>
            <th className="py-2 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              初筛量
            </th>
            <th className="py-2 pr-6 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 100 }}>
              入职数
            </th>
            <th className="py-2 text-left text-xs font-medium text-muted uppercase tracking-wide whitespace-nowrap">
              转化率
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.05} y={10}>
          {staff.map((s) => {
            const conv = safeNum(s.conversion_rate);
            const aboveAvg = conv > avgConv;
            const atAvg = conv === avgConv;
            // 高于均值 success，低于均值 danger，持平 ink
            const convColor = aboveAvg ? '#10b981' : atAvg ? '#111111' : '#ef4444';
            return (
              <tr
                key={s.hr_id}
                className="border-b border-hairline-soft hover:bg-surface-soft cursor-pointer transition-colors"
                onClick={() => onSelect(s.hr_id)}
                tabIndex={0}
                role="button"
                aria-label={`查看 ${s.name} 的详情`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(s.hr_id);
                }}
              >
                <td className="py-2.5 pr-4 font-medium text-ink whitespace-nowrap">
                  {s.name}
                </td>
                <td className="py-2.5 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.resumes)} max={maxResumes} color={BAR_COLOR_RESUMES} />
                </td>
                <td className="py-2.5 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.screens)} max={maxScreens} color={BAR_COLOR_SCREENS} />
                </td>
                <td className="py-2.5 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.onboarded)} max={maxOnboarded} color={BAR_COLOR_ONBOARDED} />
                </td>
                <td className="py-2.5">
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
    [days]
  );

  const [selectedHrId, setSelectedHrId] = useState<number | null>(null);

  // 下钻状态优先渲染，确保 hooks 顺序不变
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
    <div>
      {/* 标题栏 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-ink">数据看板</h1>
          <p className="mt-0.5 text-sm text-muted">团队招聘漏斗与专员效能对比</p>
        </div>
        {/* 时间范围切换器 — SegmentedControl（Cal.com 签名组件） */}
        <SegmentedControl<number>
          options={DAYS_OPTIONS}
          value={days}
          onChange={onDaysChange}
          size="sm"
        />
      </div>

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
          {/* KPI 指标行 */}
          <Reveal as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.07}>
            <KpiCard
              label="在招专员数"
              value={<AnimatedNumber value={data.staff.length} />}
              sub="本期活跃"
            />
            <KpiCard
              label="本期入职"
              value={<AnimatedNumber value={safeNum(data.funnel.onboarded)} />}
              sub="已入职人数"
            />
            <KpiCard
              label="整体转化率"
              value={<AnimatedNumber value={safeNum(data.funnel.conversion_rate)} decimals={1} suffix="%" />}
              sub="待筛选 → 入职"
            />
            <KpiCard
              label="简历总量"
              value={<AnimatedNumber value={safeNum(data.funnel.pending)} />}
              sub="流入简历"
            />
          </Reveal>

          {/* 图表行 */}
          <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-2" stagger={0.1} y={20}>
            {/* 团队招聘漏斗 — 自定义 SVG 梯形漏斗 */}
            <Card>
              <CardHeader>
                <CardTitle>团队招聘漏斗</CardTitle>
              </CardHeader>
              <CardBody>
                <FunnelDiagram
                  stages={FUNNEL_STAGES.map(({ key, label }, i) => ({
                    label,
                    value: safeNum(data.funnel[key]),
                    color: FUNNEL_COLORS[i] ?? '#111111',
                  }))}
                  rejected={safeNum(data.funnel.rejected)}
                  rejectedColor={REJECTED_COLOR}
                />
              </CardBody>
            </Card>

            {/* 转化率仪表 + 阶段汇总 */}
            <Card>
              <CardHeader>
                <CardTitle>转化总览</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="mb-5 flex justify-center">
                  <ConversionRing percent={safeNum(data.funnel.conversion_rate)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {FUNNEL_STAGES.map(({ key, label }) => (
                    <div key={key} className="rounded-lg bg-surface-soft px-3 py-2.5">
                      <p className="text-xs text-muted mb-0.5">{label}</p>
                      <p className="text-lg font-display text-ink">
                        <AnimatedNumber value={safeNum(data.funnel[key])} />
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </Reveal>

          {/* 专员效能对比 */}
          <Card>
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
    [hrId, days]
  );

  const name = staffMember?.name ?? `专员 #${hrId}`;
  const conv = staffMember ? safeNum(staffMember.conversion_rate) : null;
  const avg = teamAvgConv ?? 0;
  const aboveAvg = conv !== null && conv > avg;
  const atAvg = conv !== null && conv === avg;

  return (
    <div>
      {/* 返回导航 */}
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink focus:outline-none focus-visible:underline"
      >
        ← 返回团队总览
      </button>

      {/* 专员标题 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
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

      {/* 专员 KPI 卡片（来自第一层数据） */}
      {staffMember && (
        <Reveal as="div" className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.07}>
          <KpiCard label="简历量" value={<AnimatedNumber value={safeNum(staffMember.resumes)} />} />
          <KpiCard label="初筛量" value={<AnimatedNumber value={safeNum(staffMember.screens)} />} />
          <KpiCard label="入职数" value={<AnimatedNumber value={safeNum(staffMember.onboarded)} />} />
          <KpiCard label="转化率" value={<AnimatedNumber value={safeNum(staffMember.conversion_rate)} decimals={1} suffix="%" />} />
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
        <Card>
          <CardHeader>
            <CardTitle>个人招聘漏斗</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <FunnelDiagram
                stages={FUNNEL_STAGES.map(({ key, label }, i) => ({
                  label,
                  value: safeNum(data.funnel[key]),
                  color: FUNNEL_COLORS[i] ?? '#111111',
                }))}
                rejected={safeNum(data.funnel.rejected)}
                rejectedColor={REJECTED_COLOR}
              />
              <div className="flex justify-center lg:px-4">
                <ConversionRing
                  percent={safeNum(data.funnel.conversion_rate)}
                  label="个人转化率"
                  size={140}
                />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FUNNEL_STAGES.map(({ key, label }) => (
                <div key={key} className="rounded-lg bg-surface-soft px-3 py-2.5">
                  <p className="text-xs text-muted mb-0.5">{label}</p>
                  <p className="text-xl font-display text-ink">
                    <AnimatedNumber value={safeNum(data.funnel[key])} />
                  </p>
                </div>
              ))}
              <div className="rounded-lg bg-danger-50 px-3 py-2.5">
                <p className="text-xs text-danger-600 mb-0.5">淘汰</p>
                <p className="text-xl font-display text-danger-700">
                  <AnimatedNumber value={safeNum(data.funnel.rejected)} />
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
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
