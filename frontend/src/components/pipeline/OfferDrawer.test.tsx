import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { OfferDrawer } from './OfferDrawer';

const apiMocks = vi.hoisted(() => ({
  getOfferRecord: vi.fn(),
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getOfferRecord: apiMocks.getOfferRecord,
    },
  };
});

describe('OfferDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when offer loading fails', async () => {
    apiMocks.getOfferRecord.mockRejectedValueOnce(new Error('Offer 记录加载失败'));

    render(<OfferDrawer candidateId={7} jobId={21} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Offer 记录加载失败');
  });
});
