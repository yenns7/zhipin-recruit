import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test/utils';
import { PipelinePage } from './PipelinePage';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listJobs: vi.fn().mockResolvedValue([]),
      getPipelineBoard: vi.fn(),
    },
  };
});

describe('PipelinePage', () => {
  it('renders the pipeline page header and empty jobs state', async () => {
    render(<PipelinePage />);

    expect(screen.getByText('候选人流程')).toBeInTheDocument();
    expect(await screen.findByText('暂无岗位')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建岗位' })).toBeInTheDocument();
  });
});
