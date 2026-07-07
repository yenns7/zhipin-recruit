import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { InterviewGuidePanel } from './InterviewGuidePanel';

const apiMocks = vi.hoisted(() => ({
  getInterviewGuide: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getInterviewGuide: apiMocks.getInterviewGuide,
    },
  };
});

describe('InterviewGuidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when guide loading fails', async () => {
    apiMocks.getInterviewGuide.mockRejectedValueOnce(new Error('追问参考加载失败'));

    render(<InterviewGuidePanel candidateId={7} jobId={21} round="interview_first" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('追问参考加载失败');
  });
});
