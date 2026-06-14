// AI 助手对话状态 Context。
// 把对话历史从 AgentPage 组件内提升到此 Provider —— Provider 挂在 AppShell 的
// Outlet 之上，切换路由时 AppShell 不卸载，故对话历史跨页面保留（刷新才清空）。
// 仅持有状态与跨渲染的 ref；具体收发逻辑仍在 AgentPage，以保持关注点分离。

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';

// ---- 对话视图模型（AgentPage 与本 Context 共用）----

export interface ToolCallView {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export type ConfirmStatus = 'pending' | 'executing' | 'done' | 'failed' | 'cancelled';

export interface WriteProposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: ConfirmStatus;
  resultText?: string;
}

export type TurnStatus = 'streaming' | 'done' | 'error';

export interface UserMessage {
  kind: 'user';
  id: number;
  text: string;
}

export interface AssistantMessage {
  kind: 'assistant';
  id: number;
  thoughts: string[];
  toolCalls: ToolCallView[];
  answer: string;
  status: TurnStatus;
  error?: string;
  proposal?: WriteProposal;
}

export type Message = UserMessage | AssistantMessage;

interface AgentChatValue {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  streaming: boolean;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  // 跨渲染保留的引用
  abortRef: MutableRefObject<AbortController | null>;
  toolSeqRef: MutableRefObject<number>;
}

const AgentChatContext = createContext<AgentChatValue | undefined>(undefined);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const toolSeqRef = useRef(0);

  return (
    <AgentChatContext.Provider
      value={{
        messages,
        setMessages,
        input,
        setInput,
        streaming,
        setStreaming,
        abortRef,
        toolSeqRef,
      }}
    >
      {children}
    </AgentChatContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgentChat(): AgentChatValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) {
    throw new Error('useAgentChat must be used within an AgentChatProvider');
  }
  return ctx;
}
