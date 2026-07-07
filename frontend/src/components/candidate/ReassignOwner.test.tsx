import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { ReassignOwner } from './ReassignOwner';

const apiMocks = vi.hoisted(() => ({
  listCandidateOwners: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCandidateOwners: apiMocks.listCandidateOwners,
    },
  };
});

describe('ReassignOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when owner loading fails', async () => {
    apiMocks.listCandidateOwners.mockRejectedValueOnce(new Error('负责人列表加载失败'));

    render(<ReassignOwner candidateId={7} currentOwnerId={3} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('负责人列表加载失败');
  });
});
