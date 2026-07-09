import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { AddToPipeline } from './AddToPipeline';

const apiMocks = vi.hoisted(() => ({
  listCandidates: vi.fn(),
  movePipeline: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCandidates: apiMocks.listCandidates,
      movePipeline: apiMocks.movePipeline,
    },
  };
});

describe('AddToPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when candidate loading fails', async () => {
    apiMocks.listCandidates.mockRejectedValueOnce(new Error('候选人列表加载失败'));

    render(<AddToPipeline jobId={42} existingIds={new Set()} onAdded={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('候选人列表加载失败');
  });

  it('uses the shared alert-style error state when adding a candidate fails', async () => {
    apiMocks.listCandidates.mockResolvedValueOnce([
      { id: 7, nameMasked: '候选人A' },
    ]);
    apiMocks.movePipeline.mockRejectedValueOnce(new Error('加入流程失败'));

    render(<AddToPipeline jobId={42} existingIds={new Set()} onAdded={vi.fn()} />);

    fireEvent.change(await screen.findByLabelText('选择候选人'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '加入流程' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('加入流程失败');
  });
});
