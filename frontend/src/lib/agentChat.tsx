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
import { api } from './api';
import type { ConversationSummary } from '../types';

const STORAGE_KEY_CONV = 'zhipin:agent:conversation_id';
const STORAGE_KEY_CONV_LIST = 'zhipin:agent:recent_conversations';

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
  // 会话列表与管理（跨路由保留）
  conversations: ConversationSummary[];
  reloadConversations: () => Promise<void>;
  switchConversation: (id: number) => Promise<void>;
  createNewConversation: (title?: string) => Promise<number>;
  renameConversation: (id: number, title: string) => Promise<void>;
  archiveConversation: (id: number, archived: boolean) => Promise<void>;
  // 会话级内存缓存：id -> messages，切换时先读缓存避免闪烁
  conversationCache: MutableRefObject<Map<number, Message[]>>;
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

function writeStoredRecentConversations(ids: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CONV_LIST, JSON.stringify(ids.slice(0, 20)));
  } catch {
    // ignore
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const toolSeqRef = useRef(0);
  // 会话级内存缓存：切回某会话时先读缓存，避免后端往返闪烁
  const conversationCache = useRef<Map<number, Message[]>>(new Map());

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

  const reloadConversations = useCallback(async () => {
    try {
      const data = await api.listConversations({ archived: false, per_page: 100 });
      setConversations(data.items ?? []);
      // 记录最近会话 id 列表到 localStorage，便于刷新后恢复
      const ids = (data.items ?? []).map((c) => c.id);
      writeStoredRecentConversations(ids);
    } catch {
      // 列表加载失败不阻断对话
    }
  }, []);

  const switchConversation = useCallback(
    async (id: number) => {
      // 流式生成中不允许切换（避免状态错乱）
      if (streaming) return;
      // 先读内存缓存，避免闪烁
      const cached = conversationCache.current.get(id);
      if (cached) {
        setMessages(cached);
      } else {
        setMessages([]);
      }
      setConversationId(id);
      try {
        const dbMessages = await loadConversationMessages(id);
        hydrateMessagesFromDb(dbMessages);
      } catch {
        // 加载失败保留缓存或空状态
      }
    },
    [streaming, setConversationId, loadConversationMessages, hydrateMessagesFromDb],
  );

  const createNewConversation = useCallback(
    async (title?: string): Promise<number> => {
      const created = await api.createConversation(title);
      await reloadConversations();
      setMessages([]);
      conversationCache.current.delete(created.id);
      setConversationId(created.id);
      return created.id;
    },
    [reloadConversations, setConversationId],
  );

  const renameConversation = useCallback(
    async (id: number, title: string) => {
      await api.updateConversation(id, { title });
      await reloadConversations();
    },
    [reloadConversations],
  );

  const archiveConversation = useCallback(
    async (id: number, archived: boolean) => {
      await api.updateConversation(id, { archived });
      await reloadConversations();
    },
    [reloadConversations],
  );

  // 切换会话前，把当前会话消息缓存起来（供切回时快速恢复）
  useEffect(() => {
    if (conversationId !== null) {
      conversationCache.current.set(conversationId, messages);
    }
  }, [messages, conversationId]);

  // 挂载时：恢复最近会话（修复 A2 —— 不再清空，而是尝试恢复或引导新建）
  useEffect(() => {
    let cancelled = false;
    reloadConversations();
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
        // 读不到不再清空 messages —— 保留当前（空）状态，引导用户新建或选历史
        if (!cancelled) {
          setConversationId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hydrateMessagesFromDb, loadConversationMessages, reloadConversations, setConversationId]);

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
        conversations,
        reloadConversations,
        switchConversation,
        createNewConversation,
        renameConversation,
        archiveConversation,
        conversationCache,
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
