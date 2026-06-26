// AI 助手对话状态 Context。
// 把对话历史从 AgentPage 组件内提升到此 Provider —— Provider 挂在 AppShell 的
// Outlet 之上，切换路由时 AppShell 不卸载，故对话历史跨页面保留（刷新才清空）。
// 仅持有状态与跨渲染的 ref；具体收发逻辑仍在 AgentPage，以保持关注点分离。

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from 'react';
import { getToken } from './api';

const STORAGE_KEY_CONV = 'zhipin:agent:conversation_id';

export interface ConversationMessageItem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }> | null;
  thoughts?: string[] | null;
  created_at: string | null;
}

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
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  loadConversationMessages: (id: number) => Promise<ConversationMessageItem[]>;
  hydrateMessagesFromDb: (dbMessages: ConversationMessageItem[]) => void;
}

const AgentChatContext = createContext<AgentChatValue | undefined>(undefined);

function readStoredConversationId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONV);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredConversationId(id: number | null) {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY_CONV);
    } else {
      localStorage.setItem(STORAGE_KEY_CONV, String(id));
    }
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

async function authFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`请求失败 (HTTP ${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationIdState] = useState<number | null>(
    () => readStoredConversationId(),
  );
  const abortRef = useRef<AbortController | null>(null);
  const toolSeqRef = useRef(0);

  const setConversationId = useCallback((id: number | null) => {
    setConversationIdState(id);
    writeStoredConversationId(id);
  }, []);

  const loadConversationMessages = useCallback(
    async (id: number): Promise<ConversationMessageItem[]> => {
      const data = await authFetch<{ messages: ConversationMessageItem[] }>(
        `/api/agent/conversations/${id}`,
      );
      return data.messages ?? [];
    },
    [],
  );

  const hydrateMessagesFromDb = useCallback((dbMessages: ConversationMessageItem[]) => {
    const restored: Message[] = dbMessages.map((message, index) => {
      if (message.role === 'user') {
        return { kind: 'user', id: index + 1, text: message.content };
      }
      return {
        kind: 'assistant',
        id: index + 1,
        thoughts: message.thoughts ?? [],
        toolCalls: (message.tool_calls ?? []).map((call, callIndex) => ({
          id: callIndex + 1,
          tool: call.tool,
          args: call.args ?? {},
          result: call.result,
        })),
        answer: message.content,
        status: 'done',
      };
    });
    setMessages(restored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredConversationId();
    if (!stored) return;
    loadConversationMessages(stored)
      .then((dbMessages) => {
        if (!cancelled) {
          setConversationIdState(stored);
          hydrateMessagesFromDb(dbMessages);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConversationId(null);
          setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateMessagesFromDb, loadConversationMessages, setConversationId]);

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
        conversationId,
        setConversationId,
        loadConversationMessages,
        hydrateMessagesFromDb,
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
