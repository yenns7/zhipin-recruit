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
    hr_id: 101,
    name: '测试招聘专员',
    resumes: 20,
    parsed_ok: 18,
    parse_failed: 1,
    parse_pending: 1,
    screens: 8,
    effective_recommendations: 6,
    business_review_entries: 5,
    interview_entries: 2,
    interview_feedbacks: 1,
    interview_passed: 1,
    interview_pass_rate: 50,
    interview_to_offer_rate: 50,
    offer_entries: 1,
    onboarded: 1,
    conversion_rate: 25,
    recommendation_to_onboard_rate: 25,
    feedback_pending: 4,
    feedback_overdue: 1,
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
