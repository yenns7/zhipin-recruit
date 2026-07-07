import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test/utils';
import { JobsPage } from './JobsPage';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listJobs: vi.fn().mockResolvedValue([]),
    },
  };
});

describe('JobsPage', () => {
  it('renders the jobs page header and empty active jobs state', async () => {
    render(<JobsPage />);

    expect(
      screen.getByRole('heading', { name: '岗位画像' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('暂无在招岗位'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('点击右上角「新增岗位」创建第一个招聘岗位'),
    ).toBeInTheDocument();
  });
});
