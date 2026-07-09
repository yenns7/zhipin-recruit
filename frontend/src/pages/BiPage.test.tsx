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
          archivedTotal: 0,
          conversionRate: 0,
          pipelineTotal: 0,
        },
        staff: [],
        demands: {
          activeTotal: 0,
          overdue: 0,
          hrNoRecommendation: 0,
          businessFeedbackPending: 0,
          priorityCounts: { A: 0, B: 0, C: 0 },
        },
        resumes: {
          totalCandidates: 0,
          linkedToJob: 0,
          unassigned: 0,
          matchedCandidates: 0,
          matchRate: 0,
          inPipeline: 0,
          notInPipeline: 0,
          pipelineEntryRate: 0,
        },
        sourceQuality: [],
        interviewerAccountability: [],
        departmentAccountability: [],
        alerts: [],
        dataQualityWarnings: [],
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
        generatedAt: '2026-07-09T08:00:00Z',
        adminOrManager: 'admin',
        parsedCandidates: 0,
        candidateTotal: 0,
        activeJobs: 0,
        summary: [],
        funnel: {
          pending: 0,
          ai_screen: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          archivedTotal: 0,
          conversionRate: 0,
          pipelineTotal: 0,
        },
        staff: [],
        demands: {
          activeTotal: 0,
          overdue: 0,
          hrNoRecommendation: 0,
          businessFeedbackPending: 0,
          priorityCounts: { A: 0, B: 0, C: 0 },
        },
        resumes: {
          totalCandidates: 0,
          linkedToJob: 0,
          unassigned: 0,
          matchedCandidates: 0,
          matchRate: 0,
          inPipeline: 0,
          notInPipeline: 0,
          pipelineEntryRate: 0,
        },
        sourceQuality: [],
        interviewerAccountability: [],
        departmentAccountability: [],
        alerts: [],
        dataQualityWarnings: [],
      });

    render(<BiPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('BI 总览加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('HR 绩效')).toBeInTheDocument();
    expect(api.biOverview).toHaveBeenCalledTimes(2);
  });
});
