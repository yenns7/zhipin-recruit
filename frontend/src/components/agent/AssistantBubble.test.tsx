import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { AssistantBubble } from './AssistantBubble';

describe('AssistantBubble', () => {
  it('shows a working state before any answer token arrives', () => {
    render(
      <AssistantBubble
        msg={{
          kind: 'assistant',
          id: 1,
          thoughts: [],
          toolCalls: [],
          answer: '',
          status: 'streaming',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('正在思考…')).toBeInTheDocument();
  });

  it('renders the answer, confirm card, and shared alert-style error state when present', async () => {
    render(
      <AssistantBubble
        msg={{
          kind: 'assistant',
          id: 2,
          thoughts: ['先看一下当前岗位与候选人分布'],
          toolCalls: [],
          answer: '我先帮你整理出重点。',
          status: 'error',
          error: '请求出错',
          proposal: {
            tool: 'move_pipeline',
            args: { candidateId: 12, stage: 'interview' },
            summary: '准备推进候选人到面试阶段',
            status: 'pending',
          },
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('我先帮你整理出重点。')).toBeInTheDocument();
    expect(screen.getByText('人工确认：推进管道')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('请求出错');
  });
});
