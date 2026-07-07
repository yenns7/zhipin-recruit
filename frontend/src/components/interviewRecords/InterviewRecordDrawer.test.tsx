import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { InterviewRecordDrawer } from './InterviewRecordDrawer';

const apiMocks = vi.hoisted(() => ({
  getCandidateJourney: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getCandidateJourney: apiMocks.getCandidateJourney,
    },
  };
});

describe('InterviewRecordDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when journey loading fails', async () => {
    apiMocks.getCandidateJourney.mockRejectedValueOnce(new Error('时间线加载失败'));

    render(
      <InterviewRecordDrawer
        item={{
          id: 11,
          type: 'feedback',
          candidate_id: 7,
          name_masked: '候选人A',
          job_id: 21,
          job_title: '前端工程师',
          score: 4,
          pass: true,
          round: 'onsite',
          interviewer_id: 3,
          interviewer_name: '面试官甲',
          evaluation: { 沟通: 4 },
          reason_tags: [],
          strengths: '沟通顺畅',
          concerns: null,
          note: null,
          created_at: '2026-07-01T10:00:00Z',
        }}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('时间线加载失败');
  });
});
