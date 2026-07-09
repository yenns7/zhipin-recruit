import { Reveal } from '../motion';
import type { BiStaffMember } from '../../types';
import { InlineBar, pct, safeNum } from './biMetrics';

const BAR_COLOR_RESUMES = '#007AFF';
const BAR_COLOR_ONBOARDED = '#34C759';
const BAR_COLOR_RECOMMENDATIONS = '#FF9500';

interface StaffPerformanceTableProps {
  staff: BiStaffMember[];
  onSelect: (hrId: number) => void;
}

export function StaffPerformanceTable({ staff, onSelect }: StaffPerformanceTableProps) {
  const maxResumes = Math.max(...staff.map((s) => safeNum(s.resumes)), 1);
  const maxRecommendations = Math.max(...staff.map((s) => safeNum(s.effectiveRecommendations)), 1);
  const maxOnboarded = Math.max(...staff.map((s) => safeNum(s.onboarded)), 1);
  const avgRecommendRate = staff.length === 0
    ? 0
    : staff.reduce((acc, s) => acc + safeNum(s.recommendationToOnboardRate), 0) / staff.length;

  if (staff.length === 0) {
    return <p className="py-2 text-sm text-muted">暂无专员数据</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              专员
            </th>
            <th className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted" style={{ minWidth: 100 }}>
              简历量
            </th>
            <th className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted" style={{ minWidth: 100 }}>
              有效推荐
            </th>
            <th className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted" style={{ minWidth: 96 }}>
              推荐成功面试
            </th>
            <th className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted" style={{ minWidth: 96 }}>
              面试通过
            </th>
            <th className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted" style={{ minWidth: 100 }}>
              入职数
            </th>
            <th className="whitespace-nowrap py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted">
              推荐入职率
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.05} y={10}>
          {staff.map((s) => {
            const recommendRate = safeNum(s.recommendationToOnboardRate);
            const aboveAvg = recommendRate > avgRecommendRate;
            const atAvg = recommendRate === avgRecommendRate;
            const convColor = aboveAvg ? '#34C759' : atAvg ? '#111111' : '#FF3B30';

            return (
              <tr
                key={s.hrId}
                className="cursor-pointer border-b border-hairline-soft transition-all duration-200 hover:bg-surface-soft hover:shadow-apple-sm"
                onClick={() => onSelect(s.hrId)}
                tabIndex={0}
                role="button"
                aria-label={`查看 ${s.name} 的详情`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(s.hrId);
                }}
              >
                <td className="whitespace-nowrap py-3 pr-4 font-medium text-ink">
                  {s.name}
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.resumes)} max={maxResumes} color={BAR_COLOR_RESUMES} />
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar
                    value={safeNum(s.effectiveRecommendations)}
                    max={maxRecommendations}
                    color={BAR_COLOR_RECOMMENDATIONS}
                  />
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 96 }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {safeNum(s.interviewEntries)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-soft">推荐进面</span>
                  </div>
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 96 }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {safeNum(s.interviewPassed)} / {safeNum(s.interviewEntries)}
                    </span>
                    <span className="text-xs tabular-nums text-muted-soft">
                      {pct(safeNum(s.interviewPassRate))}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                  <InlineBar value={safeNum(s.onboarded)} max={maxOnboarded} color={BAR_COLOR_ONBOARDED} />
                </td>
                <td className="py-3">
                  <span className="text-xs font-semibold tabular-nums" style={{ color: convColor }}>
                    {pct(recommendRate)}
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
