import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../test/utils';
import { BiPage } from './BiPage';
import { api } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      biOverview: vi.fn().mockResolvedValue({
        funnel: {
          pending: 0,
          ai_screen: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          archived_total: 0,
          conversion_rate: 0,
          pipeline_total: 0,
        },
        staff: [],
        demands: {
          active_total: 0,
          overdue: 0,
          hr_no_recommendation: 0,
          business_feedback_pending: 0,
          priority_counts: { A: 0, B: 0, C: 0 },
        },
        resumes: {
          total_candidates: 0,
          linked_to_job: 0,
          unassigned: 0,
          matched_candidates: 0,
          match_rate: 0,
          in_pipeline: 0,
          not_in_pipeline: 0,
          pipeline_entry_rate: 0,
        },
        source_quality: [],
        interviewer_accountability: [],
        department_accountability: [],
        alerts: [],
        data_quality_warnings: [],
      }),
      biStaff: vi.fn(),
    },
  };
});

describe('BiPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the BI dashboard header and staff empty-state copy', async () => {
    render(<BiPage />);

    expect(screen.getByText('数据看板')).toBeInTheDocument();
    expect(await screen.findByText('HR 绩效')).toBeInTheDocument();
    expect(screen.getByText('本期暂无专员数据')).toBeInTheDocument();
  });

  it('renders the shared alert-style error state and supports retry', async () => {
    vi.mocked(api.biOverview)
      .mockRejectedValueOnce(new Error('BI 总览加载失败'))
      .mockResolvedValueOnce({
        funnel: {
          pending: 0,
          ai_screen: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          archived_total: 0,
          conversion_rate: 0,
          pipeline_total: 0,
        },
        staff: [],
        demands: {
          active_total: 0,
          overdue: 0,
          hr_no_recommendation: 0,
          business_feedback_pending: 0,
          priority_counts: { A: 0, B: 0, C: 0 },
        },
        resumes: {
          total_candidates: 0,
          linked_to_job: 0,
          unassigned: 0,
          matched_candidates: 0,
          match_rate: 0,
          in_pipeline: 0,
          not_in_pipeline: 0,
          pipeline_entry_rate: 0,
        },
        source_quality: [],
        interviewer_accountability: [],
        department_accountability: [],
        alerts: [],
        data_quality_warnings: [],
      });

    render(<BiPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('BI 总览加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('HR 绩效')).toBeInTheDocument();
    expect(api.biOverview).toHaveBeenCalledTimes(2);
  });
});
