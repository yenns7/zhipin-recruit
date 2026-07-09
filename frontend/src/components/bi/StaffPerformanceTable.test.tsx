import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { StaffPerformanceTable } from './StaffPerformanceTable';

describe('StaffPerformanceTable', () => {
  it('renders the empty-state guidance when no staff data exists', () => {
    render(<StaffPerformanceTable staff={[]} onSelect={vi.fn()} />);

    expect(screen.getByText('暂无专员数据')).toBeInTheDocument();
  });

  it('renders staff metrics and supports row drilldown by click and keyboard', () => {
    const onSelect = vi.fn();

    render(
      <StaffPerformanceTable
        staff={[
          {
            hrId: 7,
            name: '张招聘',
            resumes: 20,
            parsedOk: 18,
            parseFailed: 1,
            parsePending: 1,
            screens: 10,
            effectiveRecommendations: 6,
            businessReviewEntries: 4,
            interviewEntries: 3,
            interviewFeedbacks: 2,
            interviewPassed: 1,
            interviewPassRate: 33.3,
            interviewToOfferRate: 20,
            offerEntries: 1,
            onboarded: 1,
            conversionRate: 5,
            recommendationToOnboardRate: 16.7,
            feedbackPending: 2,
            feedbackOverdue: 1,
          },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('张招聘')).toBeInTheDocument();
    expect(screen.getByText('推荐成功面试')).toBeInTheDocument();
    expect(screen.getByText('点击专员行可查看其漏斗详情')).toBeInTheDocument();

    const rowButton = screen.getByRole('button', { name: '查看 张招聘 的详情' });
    fireEvent.click(rowButton);
    fireEvent.keyDown(rowButton, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, 7);
    expect(onSelect).toHaveBeenNthCalledWith(2, 7);
  });
});
