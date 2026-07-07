import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import type { DashboardStats } from './dashboardStats';
import { DashboardKpiGrid } from './DashboardKpiGrid';

const baseStats: DashboardStats = {
  candidates: 12,
  jobs: 4,
  businessReview: 3,
  interview: 2,
  offer: 1,
  onboarded: 1,
  conversionRate: 25,
  alerts: [],
  performance: null,
  interviewerTasks: {
    pendingFeedback: 5,
    todayInterviews: 2,
    submittedFeedback: 7,
    overdueFeedback: 1,
  },
};

describe('DashboardKpiGrid', () => {
  it('renders recruiter funnel KPI cards when team funnel metrics are enabled', () => {
    render(
      <DashboardKpiGrid
        stats={baseStats}
        showFunnelKpis
        showInterviewerKpis={false}
      />,
    );

    expect(screen.getByText('候选人总数')).toBeInTheDocument();
    expect(screen.getByText('岗位总数')).toBeInTheDocument();
    expect(screen.getByText('面试中')).toBeInTheDocument();
    expect(screen.getByText('转化率')).toBeInTheDocument();
    expect(screen.queryByText('待我反馈')).not.toBeInTheDocument();
  });

  it('renders interviewer task KPI cards without generic funnel metrics', () => {
    render(
      <DashboardKpiGrid
        stats={baseStats}
        showFunnelKpis={false}
        showInterviewerKpis
      />,
    );

    expect(screen.getByText('待我反馈')).toBeInTheDocument();
    expect(screen.getByText('今日面试')).toBeInTheDocument();
    expect(screen.getByText('已反馈')).toBeInTheDocument();
    expect(screen.getByText('超时待反馈')).toBeInTheDocument();
    expect(screen.queryByText('候选人总数')).not.toBeInTheDocument();
  });
});
