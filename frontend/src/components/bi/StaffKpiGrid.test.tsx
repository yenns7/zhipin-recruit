import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { StaffKpiGrid } from './StaffKpiGrid';

describe('StaffKpiGrid', () => {
  it('renders the staff KPI labels and summary copy', () => {
    render(
      <StaffKpiGrid
        staffMember={{
          hr_id: 9,
          name: '李招聘',
          resumes: 30,
          parsed_ok: 28,
          parse_failed: 2,
          parse_pending: 0,
          screens: 18,
          effective_recommendations: 10,
          business_review_entries: 6,
          interview_entries: 5,
          interview_feedbacks: 4,
          interview_passed: 3,
          interview_pass_rate: 60,
          interview_to_offer_rate: 40,
          offer_entries: 2,
          onboarded: 1,
          conversion_rate: 3.3,
          recommendation_to_onboard_rate: 10,
          feedback_pending: 2,
          feedback_overdue: 1,
        }}
      />,
    );

    expect(screen.getByText('简历量')).toBeInTheDocument();
    expect(screen.getByText('有效推荐')).toBeInTheDocument();
    expect(screen.getByText('推荐成功面试')).toBeInTheDocument();
    expect(screen.getByText('推荐入职率')).toBeInTheDocument();
    expect(screen.getByText('反馈待补')).toBeInTheDocument();
    expect(screen.getByText('解析失败 2')).toBeInTheDocument();
    expect(screen.getByText('已推进到 Offer')).toBeInTheDocument();
  });
});
