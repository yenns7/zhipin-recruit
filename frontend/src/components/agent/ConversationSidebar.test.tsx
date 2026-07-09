import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { ConversationSidebar } from './ConversationSidebar';

describe('ConversationSidebar', () => {
  it('renders the empty-state guidance and create action', () => {
    const onCreate = vi.fn();

    render(
      <ConversationSidebar
        conversations={[]}
        currentId={null}
        streaming={false}
        onSwitch={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('会话历史')).toBeInTheDocument();
    expect(screen.getByText(/还没有会话/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('新建会话'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('disables switching while streaming and marks the active conversation', () => {
    const onSwitch = vi.fn();

    render(
      <ConversationSidebar
        conversations={[
          {
            id: 1,
            title: '当前会话',
            updatedAt: null,
            messageCount: 2,
          },
          {
            id: 2,
            title: '另一个会话',
            updatedAt: null,
            messageCount: 1,
          },
        ]}
        currentId={1}
        streaming={true}
        onSwitch={onSwitch}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('生成中，暂不可切换')).toBeInTheDocument();

    const activeButton = screen.getByRole('button', { name: /当前会话/i });
    const otherButton = screen.getByRole('button', { name: /另一个会话/i });

    expect(activeButton).toBeDisabled();
    expect(otherButton).toBeDisabled();

    fireEvent.click(otherButton);
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
