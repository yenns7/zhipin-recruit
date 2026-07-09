import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { AgentCallLogsPage } from './AgentCallLogsPage';
import { api } from '../../lib/api';
import type { CallLogListResponse } from '../../types';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCallLogs: vi.fn(),
    },
  };
});

const callLogsResponse: CallLogListResponse = {
  items: [
    {
      id: 31,
      conversationId: 7,
      messageId: 15,
      userId: 3,
      role: 'admin',
      kind: 'tool_write',
      model: 'gpt-5',
      promptTokens: 120,
      completionTokens: 48,
      durationMs: 540,
      status: 'error',
      errorMsg: '写操作审计回放失败',
      toolCalls: [],
      thoughts: [],
      inputText: '更新候选人负责人',
      outputText: null,
      createdAt: '2026-07-06T09:00:00Z',
    },
  ],
  page: 1,
  perPage: 20,
  total: 1,
};

describe('AgentCallLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCallLogs).mockResolvedValue(callLogsResponse);
  });

  it('uses the shared alert-style error state for expanded log errors', async () => {
    render(<AgentCallLogsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /更新候选人负责人/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('写操作审计回放失败');
  });
});
