import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui';
import { AuthProvider } from '../lib/auth';
import { AgentChatProvider } from '../lib/agentChat';
import { AgentPage } from './AgentPage';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listConversations: vi.fn().mockResolvedValue({ items: [] }),
      createConversation: vi.fn(),
      updateConversation: vi.fn(),
    },
  };
});

vi.mock('../lib/agent', async () => {
  const actual = await vi.importActual<typeof import('../lib/agent')>('../lib/agent');
  return {
    ...actual,
    fetchAgentTools: vi.fn().mockResolvedValue([]),
    streamChat: vi.fn(),
    executeWriteTool: vi.fn(),
  };
});

function renderAgentPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <AgentChatProvider>
            <AgentPage />
          </AgentChatProvider>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AgentPage', () => {
  it('renders the AI assistant title and empty-state guidance', async () => {
    renderAgentPage();

    expect(screen.getByText('AI 助手')).toBeInTheDocument();
    expect(
      await screen.findByText('你好，我是招聘智能助手'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('我可以查询系统数据、整理参考建议；需要改数据时，会先等你人工确认。'),
    ).toBeInTheDocument();
  });
});
