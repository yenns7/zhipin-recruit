import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { UserBubble } from './UserBubble';

describe('UserBubble', () => {
  it('renders the user message content', () => {
    render(<UserBubble text="帮我找还没进入流程的高分候选人" />);

    expect(screen.getByText('帮我找还没进入流程的高分候选人')).toBeInTheDocument();
  });
});
