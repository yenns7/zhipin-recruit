import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { RecruiterTodoPanel } from './RecruiterTodoPanel';
import type { DashboardStats } from './dashboardStats';

const stats: DashboardStats = {
  candidates: 12,
  jobs: 3,
  businessReview: 5,
  interview: 2,
  offer: 1,
  onboarded: 1,
  conversionRate: 25,
  alerts: [],
  performance: {
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
  },
  interviewerTasks: {
    pendingFeedback: null,
    todayInterviews: null,
    submittedFeedback: null,
    overdueFeedback: null,
  },
};

describe('RecruiterTodoPanel', () => {
  it('renders recruiter todo cards with counts and target links', () => {
    render(<RecruiterTodoPanel stats={stats} />);

    expect(screen.getByText('今日待办')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /业务待反馈/ })).toHaveAttribute(
      'href',
      '/pipeline?stage=business_review',
    );
    expect(screen.getByRole('link', { name: /待补反馈/ })).toHaveAttribute(
      'href',
      '/interviews?focus=pending',
    );
    expect(screen.getByText('推动用人部门确认')).toBeInTheDocument();
    expect(screen.getByText('跟进发放与入职')).toBeInTheDocument();
  });
});
