import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { RecruiterPerformancePanel } from './RecruiterPerformancePanel';

describe('RecruiterPerformancePanel', () => {
  it('renders recruiter performance metrics with shared KPI labels', () => {
    render(
      <RecruiterPerformancePanel
        performance={{
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
