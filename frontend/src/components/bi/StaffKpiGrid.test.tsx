import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { StaffKpiGrid } from './StaffKpiGrid';

describe('StaffKpiGrid', () => {
  it('renders the staff KPI labels and summary copy', () => {
    render(
      <StaffKpiGrid
        staffMember={{
          hrId: 9,
          name: '李招聘',
          resumes: 30,
          parsedOk: 28,
          parseFailed: 2,
          parsePending: 0,
          screens: 18,
          effectiveRecommendations: 10,
          businessReviewEntries: 6,
          interviewEntries: 5,
          interviewFeedbacks: 4,
          interviewPassed: 3,
          interviewPassRate: 60,
          interviewToOfferRate: 40,
          offerEntries: 2,
          onboarded: 1,
          conversionRate: 3.3,
          recommendationToOnboardRate: 10,
          feedbackPending: 2,
          feedbackOverdue: 1,
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
