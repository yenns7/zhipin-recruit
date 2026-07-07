import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { ConfirmCard } from './ConfirmCard';

describe('ConfirmCard', () => {
  it('shows proposal details and exposes confirm and cancel actions while pending', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmCard
        proposal={{
          tool: 'create_job',
          args: { title: '高级前端工程师', city: '上海' },
          summary: '将创建一个新的岗位',
          status: 'pending',
        }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('人工确认：创建岗位')).toBeInTheDocument();
    expect(screen.getByText('将创建一个新的岗位')).toBeInTheDocument();
    expect(screen.getByText('title:')).toBeInTheDocument();
    expect(screen.getByText('高级前端工程师')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders result feedback for completed and failed proposals', async () => {
    const { rerender } = render(
      <ConfirmCard
        proposal={{
          tool: 'move_pipeline',
          args: {},
          summary: '推进候选人到下一阶段',
          status: 'done',
          resultText: '操作成功（#12）',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('操作成功（#12）')).toBeInTheDocument();

    rerender(
      <ConfirmCard
        proposal={{
          tool: 'move_pipeline',
          args: {},
          summary: '推进候选人到下一阶段',
          status: 'failed',
          resultText: '执行失败',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('执行失败');
  });
});
