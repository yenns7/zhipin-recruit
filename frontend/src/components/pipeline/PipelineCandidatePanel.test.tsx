import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { PipelineCandidatePanel } from './PipelineCandidatePanel';

describe('PipelineCandidatePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the shared alert-style error state when stage correction validation fails', async () => {
    render(
      <PipelineCandidatePanel
        candidate={{
          candidateId: 7,
          nameMasked: '候选人A',
          stage: 'pending',
          updatedAt: '2026-07-01T10:00:00Z',
          updatedByName: '招聘专员甲',
        }}
        jobId={21}
        busy={false}
        onMove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /更多操作：修正阶段/ }));
    fireEvent.change(screen.getByLabelText('修正阶段'), { target: { value: 'interview' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修正' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请填写修正原因');
  });
});
