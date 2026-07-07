import type { BiSourceQuality } from '../../types';
import { InlineBar, Reveal, pct, safeNum, safeRate } from './biMetrics';

const BAR_COLOR_RESUMES = '#007AFF';
const BAR_COLOR_ONBOARDED = '#34C759';

export function SourceQualityTable({ sources }: { sources: BiSourceQuality[] }) {
  const maxResumes = Math.max(...sources.map((source) => safeNum(source.resumes)), 1);
  const maxOnboarded = Math.max(...sources.map((source) => safeNum(source.onboarded)), 1);

  if (sources.length === 0) {
    return <p className="py-2 text-sm text-muted">暂无渠道数据</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              渠道
            </th>
            <th
              className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 100 }}
            >
              简历量
            </th>
            <th
              className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 96 }}
            >
              推荐成功面试
            </th>
            <th
              className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 96 }}
            >
              面试通过
            </th>
            <th
              className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 96 }}
            >
              面试到 Offer
            </th>
            <th
              className="whitespace-nowrap py-2.5 pr-6 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 90 }}
            >
              Offer
            </th>
            <th
              className="whitespace-nowrap py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted"
              style={{ minWidth: 100 }}
            >
              入职率
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.05} y={10}>
          {sources.map((source) => (
            <tr
              key={source.channel}
              className="border-b border-hairline-soft transition-colors hover:bg-surface-soft"
            >
              <td className="whitespace-nowrap py-3 pr-4 font-medium text-ink">{source.channel}</td>
              <td className="py-3 pr-6" style={{ minWidth: 100 }}>
                <InlineBar
                  value={safeNum(source.resumes)}
                  max={maxResumes}
                  color={BAR_COLOR_RESUMES}
                />
              </td>
              <td className="py-3 pr-6 tabular-nums text-body" style={{ minWidth: 96 }}>
                {safeNum(source.interview_entries)}
                <span className="ml-1 text-xs text-muted-soft">
                  {pct(safeRate(safeNum(source.interview_entries), safeNum(source.resumes)))}
                </span>
              </td>
              <td className="py-3 pr-6" style={{ minWidth: 96 }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {safeNum(source.interview_passed)} / {safeNum(source.interview_entries)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-soft">
                    {pct(safeNum(source.interview_pass_rate))}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-6" style={{ minWidth: 96 }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {safeNum(source.offer_entries)} / {safeNum(source.interview_entries)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-soft">
                    {pct(safeNum(source.interview_to_offer_rate))}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-6 tabular-nums text-body" style={{ minWidth: 90 }}>
                {safeNum(source.offer_entries)}
              </td>
              <td className="py-3" style={{ minWidth: 100 }}>
                <div className="flex items-center gap-2">
                  <div className="w-16 shrink-0">
                    <InlineBar
                      value={safeNum(source.onboarded)}
                      max={maxOnboarded}
                      color={BAR_COLOR_ONBOARDED}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-success-700">
                    {pct(safeNum(source.onboard_rate))}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </Reveal>
      </table>
    </div>
  );
}
