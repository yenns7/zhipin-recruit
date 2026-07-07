import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { PipelineProgress } from './PipelineProgress';

const apiMocks = vi.hoisted(() => ({
  getCandidatePipelines: vi.fn(),
  getCandidateJourney: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getCandidatePipelines: apiMocks.getCandidatePipelines,
      getCandidateJourney: apiMocks.getCandidateJourney,
    },
  };
});

describe('PipelineProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when pipeline loading fails', async () => {
    apiMocks.getCandidatePipelines.mockRejectedValueOnce(new Error('流程加载失败'));

    render(<PipelineProgress candidateId={7} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('流程加载失败');
  });

  it('uses the shared alert-style error state when journey detail loading fails', async () => {
    apiMocks.getCandidatePipelines.mockResolvedValueOnce({
      pipelines: [{ job_id: 101, job_title: '前端工程师', stage: 'interview' }],
    });
    apiMocks.getCandidateJourney.mockRejectedValueOnce(new Error('时间线加载失败'));

    render(<PipelineProgress candidateId={7} />);

    fireEvent.click(await screen.findByRole('button', { name: /前端工程师/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('时间线加载失败');
  });
});
