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
            hr_id: 7,
            name: '张招聘',
            resumes: 20,
            parsed_ok: 18,
            parse_failed: 1,
            parse_pending: 1,
            screens: 10,
            effective_recommendations: 6,
            business_review_entries: 4,
            interview_entries: 3,
            interview_feedbacks: 2,
            interview_passed: 1,
            interview_pass_rate: 33.3,
            interview_to_offer_rate: 20,
            offer_entries: 1,
            onboarded: 1,
            conversion_rate: 5,
            recommendation_to_onboard_rate: 16.7,
            feedback_pending: 2,
            feedback_overdue: 1,
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
