import type { BiStaffMember } from '../../types';
import { KpiCard } from '../bi/KpiCard';
import { Reveal } from '../motion';
import { Badge } from '../ui';

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function RecruiterPerformancePanel({ performance }: { performance: BiStaffMember | null }) {
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
          value={valueOrNull(performance?.effectiveRecommendations)}
          accent="#FF9500"
        />
        <KpiCard
          label="推荐成功面试"
          value={valueOrNull(performance?.interviewEntries)}
          accent="#007AFF"
        />
        <KpiCard
          label="面试通过"
          value={valueOrNull(performance?.interviewPassed)}
          accent="#5856D6"
        />
        <KpiCard
          label="Offer"
          value={valueOrNull(performance?.offerEntries)}
          accent="#AF52DE"
        />
        <KpiCard
          label="已入职"
          value={valueOrNull(performance?.onboarded)}
          accent="#34C759"
        />
        <KpiCard
          label="待补反馈"
          value={valueOrNull(performance?.feedbackPending)}
          accent="#FF3B30"
        />
      </Reveal>
    </section>
  );
}
