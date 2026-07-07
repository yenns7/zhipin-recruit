import { Reveal } from '../motion';
import { KpiCard } from '../bi/KpiCard';
import type { DashboardStats } from './dashboardStats';

interface DashboardKpiGridProps {
  stats: DashboardStats;
  showFunnelKpis: boolean;
  showInterviewerKpis: boolean;
}

export function DashboardKpiGrid({
  stats,
  showFunnelKpis,
  showInterviewerKpis,
}: DashboardKpiGridProps) {
  return (
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
              <KpiCard
                label="转化率"
                value={stats.conversionRate}
                decimals={1}
                suffix="%"
                accent="#34C759"
              />
            )}
          </>
        )}
      </Reveal>
    </section>
  );
}
