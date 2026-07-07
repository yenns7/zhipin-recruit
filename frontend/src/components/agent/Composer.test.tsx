import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { Composer } from './Composer';

describe('Composer', () => {
  it('sends on Enter and avoids sending on Shift+Enter', () => {
    const onSend = vi.fn();

    render(
      <Composer
        value="帮我看看今天的面试反馈"
        onChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
        streaming={false}
      />,
    );

    const input = screen.getByPlaceholderText('输入问题，Enter 发送 · Shift+Enter 换行');

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('shows the stop action while streaming', () => {
    const onStop = vi.fn();

    render(
      <Composer
        value="正在生成"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={onStop}
        streaming={true}
      />,
    );

    expect(screen.getByPlaceholderText('智能体回答中…')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('停止'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
