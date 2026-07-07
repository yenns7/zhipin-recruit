import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { FeedbackForm } from './FeedbackForm';
import { api } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      submitFeedback: vi.fn(),
      movePipeline: vi.fn(),
    },
  };
});

describe('FeedbackForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when submitting feedback fails', async () => {
    vi.mocked(api.submitFeedback).mockRejectedValueOnce(new Error('提交失败'));

    render(<FeedbackForm candidateId={11} jobId={21} />);

    fireEvent.click(screen.getByRole('button', { name: '提交评分' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交失败');
  });
});
