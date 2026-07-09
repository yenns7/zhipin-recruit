import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { RecruiterPerformancePanel } from './RecruiterPerformancePanel';

describe('RecruiterPerformancePanel', () => {
  it('renders recruiter performance metrics with shared KPI labels', () => {
    render(
      <RecruiterPerformancePanel
        performance={{
          hrId: 101,
          name: '测试招聘专员',
          resumes: 20,
          parsedOk: 18,
          parseFailed: 1,
          parsePending: 1,
          screens: 8,
          effectiveRecommendations: 6,
          businessReviewEntries: 5,
          interviewEntries: 2,
          interviewFeedbacks: 1,
          interviewPassed: 1,
          interviewPassRate: 50,
          interviewToOfferRate: 50,
          offerEntries: 1,
          onboarded: 1,
          conversionRate: 25,
          recommendationToOnboardRate: 25,
          feedbackPending: 4,
          feedbackOverdue: 1,
        }}
      />,
    );

    expect(screen.getByText('我的本月业绩')).toBeInTheDocument();
    expect(screen.getByText('近 30 天')).toBeInTheDocument();
    expect(screen.getByText('有效推荐')).toBeInTheDocument();
    expect(screen.getByText('推荐成功面试')).toBeInTheDocument();
    expect(screen.getByText('待补反馈')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
