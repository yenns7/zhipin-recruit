import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { StaffDrilldown } from './StaffDrilldown';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      biStaff: vi.fn(),
    },
  };
});

import { api } from '../../lib/api';

const staffMember = {
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
};

describe('StaffDrilldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders staff details, warnings, funnel, and back actions', async () => {
    vi.mocked(api.biStaff).mockResolvedValue({
      hr_id: 7,
      performance: staffMember,
      funnel: {
        pending: 4,
        ai_screen: 3,
        interview: 2,
        offer: 1,
        onboarded: 1,
        rejected: 2,
        conversion_rate: 12.5,
        archived_total: 3,
        funnel_total: 8,
        pipeline_total: 7,
      },
      data_quality_warnings: [
        {
          kind: 'warning',
          metric: 'feedback_pending',
          label: '反馈超时偏多',
          numerator: 3,
          denominator: 10,
          detail: '请补齐候选人反馈',
        },
      ],
    });

    const onBack = vi.fn();
    render(
      <StaffDrilldown
        hrId={7}
        days={30}
        staffMember={staffMember}
        teamAvgConv={12.3}
        onBack={onBack}
      />,
    );

    expect(await screen.findByText('张招聘')).toBeInTheDocument();
    expect(screen.getByText('个人招聘漏斗')).toBeInTheDocument();
    expect(screen.getByText('数据质量提醒')).toBeInTheDocument();
    expect(screen.getByText('反馈超时偏多')).toBeInTheDocument();

    const backButtons = screen.getAllByRole('button', { name: '← 返回团队总览' });
    fireEvent.click(backButtons[0]);
    fireEvent.click(backButtons[1]);

    expect(onBack).toHaveBeenCalledTimes(2);
    expect(api.biStaff).toHaveBeenCalledWith(7, 30);
  });

  it('renders the async error state and lets users retry', async () => {
    vi.mocked(api.biStaff)
      .mockRejectedValueOnce(new Error('专员详情加载失败'))
      .mockResolvedValueOnce({
        hr_id: 8,
        funnel: {
          pending: 0,
          ai_screen: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          rejected: 0,
          conversion_rate: 0,
          archived_total: 0,
          funnel_total: 0,
          pipeline_total: 0,
        },
        data_quality_warnings: [],
      });

    render(
      <StaffDrilldown
        hrId={8}
        days={7}
        staffMember={null}
        teamAvgConv={null}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('专员详情加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('个人招聘漏斗')).toBeInTheDocument();
    expect(api.biStaff).toHaveBeenCalledTimes(2);
  });
});
