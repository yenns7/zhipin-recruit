// AI 助手 — 智能体对话页。
// 通过 fetch + ReadableStream 消费后端 SSE 流，逐步展示智能体的完整工作过程：
// 思考(thought) → 调用工具(tool_call) → 拿到数据(tool_result) → 流式回答(token)。
// 维护多轮 history，每次请求带上历史消息实现连续对话。

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Brain, Sparkles, Square, User } from 'lucide-react';
import {
  fetchAgentTools,
  streamChat,
  toolMeta,
  type AgentEvent,
  type AgentTool,
  type ChatTurn,
} from '../lib/agent';
import { cn } from '../lib/cn';
import { RichText } from '../components/agent/RichText';
import { ThoughtTrace } from '../components/agent/ThoughtTrace';
import { ToolCallCard } from '../components/agent/ToolCallCard';

// ---- View model ----------------------------------------------------------

interface ToolCallView {
  id: number;
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
}

type TurnStatus = 'streaming' | 'done' | 'error';

interface UserMessage {
  kind: 'user';
  id: number;
  text: string;
}

interface AssistantMessage {
  kind: 'assistant';
  id: number;
  thoughts: string[];
  toolCalls: ToolCallView[];
  answer: string;
  status: TurnStatus;
  error?: string;
}

type Message = UserMessage | AssistantMessage;

// Example prompts surfaced when the conversation is empty.
const EXAMPLES = [
  '系统里有多少候选人和岗位？',
  '给第一个岗位匹配候选人',
  '看看团队招聘漏斗报表',
  '列出所有岗位',
];

let idSeq = 0;
const nextId = () => ++idSeq;

export function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tools, setTools] = useState<AgentTool[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toolSeqRef = useRef(0);

  // Build the history payload (user/assistant pairs) from completed turns.
  const buildHistory = useCallback((msgs: Message[]): ChatTurn[] => {
    const turns: ChatTurn[] = [];
    for (const m of msgs) {
      if (m.kind === 'user') {
        turns.push({ role: 'user', content: m.text });
      } else if (m.status === 'done' && m.answer) {
        turns.push({ role: 'assistant', content: m.answer });
      }
    }
    return turns;
  }, []);

  // Mutate the in-flight assistant message (always the last one) per event.
  const applyEvent = useCallback((assistantId: number, ev: AgentEvent) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== 'assistant' || m.id !== assistantId) return m;
        switch (ev.type) {
          case 'thought':
            return { ...m, thoughts: [...m.thoughts, ev.text] };
          case 'tool_call':
            return {
              ...m,
              toolCalls: [
                ...m.toolCalls,
                { id: ++toolSeqRef.current, tool: ev.tool, args: ev.args },
              ],
            };
          case 'tool_result': {
            // Attach to the latest pending call for this tool name.
            const calls = [...m.toolCalls];
            for (let i = calls.length - 1; i >= 0; i--) {
              if (calls[i].tool === ev.tool && calls[i].result === undefined) {
                calls[i] = { ...calls[i], result: ev.result };
                break;
              }
            }
            return { ...m, toolCalls: calls };
          }
          case 'token':
            return { ...m, answer: m.answer + ev.text };
          case 'done':
            return {
              ...m,
              answer: ev.answer || m.answer,
              status: 'done',
            };
          case 'error':
            return { ...m, status: 'error', error: ev.message };
          default:
            return m;
        }
      })
    );
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;

      const userMsg: UserMessage = { kind: 'user', id: nextId(), text };
      const assistantId = nextId();
      const assistantMsg: AssistantMessage = {
        kind: 'assistant',
        id: assistantId,
        thoughts: [],
        toolCalls: [],
        answer: '',
        status: 'streaming',
      };

      // History is everything *before* this new exchange.
      const history = buildHistory(messages);

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat(
          { message: text, history, signal: controller.signal },
          (ev) => applyEvent(assistantId, ev)
        );
        // Stream ended without an explicit done/error → mark done.
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === 'assistant' && m.id === assistantId && m.status === 'streaming'
              ? { ...m, status: 'done' }
              : m
          )
        );
      } catch (err) {
        const aborted = controller.signal.aborted;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.kind !== 'assistant' || m.id !== assistantId) return m;
            if (aborted) {
              return { ...m, status: 'done', answer: m.answer || '（已停止）' };
            }
            return {
              ...m,
              status: 'error',
              error: err instanceof Error ? err.message : '请求出错',
            };
          })
        );
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStreaming(false);
      }
    },
    [streaming, messages, buildHistory, applyEvent]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Load the capability catalogue once for the empty-state cloud.
  useEffect(() => {
    const controller = new AbortController();
    fetchAgentTools(controller.signal)
      .then(setTools)
      .catch(() => {
        /* non-critical */
      });
    return () => controller.abort();
  }, []);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Auto-scroll to the bottom as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* 页头 */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-display text-ink">AI 助手</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-0.5 text-xs font-medium text-muted">
              <Sparkles className="h-3 w-3" />
              DeepSeek v4 驱动
            </span>
          </div>
          <p className="text-sm text-muted">
            用自然语言查询候选人、岗位、匹配、流程和团队报表 · 智能体自主决策并调用工具
          </p>
        </div>
      </div>

      {/* 消息区 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-lg border border-hairline bg-canvas"
      >
        {isEmpty ? (
          <EmptyState tools={tools} onPick={send} disabled={streaming} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
            {messages.map((m) =>
              m.kind === 'user' ? (
                <UserBubble key={m.id} text={m.text} />
              ) : (
                <AssistantBubble key={m.id} msg={m} />
              )
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send(input)}
        onStop={stop}
        streaming={streaming}
      />
    </div>
  );
}

// ---- Empty state: capability hints --------------------------------------

function EmptyState({
  tools,
  onPick,
  disabled,
}: {
  tools: AgentTool[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-14 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white">
        <Sparkles className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-display text-ink">你好，我是招聘智能助手</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted">
        我可以自主思考、调用系统工具并整合数据来回答你的问题。试试下面的问题，或直接输入。
      </p>

      {/* 示例问题 */}
      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className={cn(
              'rounded-md border border-hairline bg-surface-soft px-4 py-3 text-left text-sm text-body transition-colors',
              'hover:border-surface-strong hover:bg-surface-card disabled:opacity-50'
            )}
          >
            {q}
          </button>
        ))}
      </div>

      {/* 能力清单 */}
      {tools.length > 0 && (
        <div className="mt-8 w-full">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-soft">
            我能调用的工具
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {tools.map((t) => {
              const meta = toolMeta(t.name);
              const Icon = meta.icon;
              return (
                <span
                  key={t.name}
                  title={t.description}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas px-3 py-1 text-xs font-medium text-body"
                >
                  <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Message bubbles -----------------------------------------------------

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-card text-body">
        <User className="h-4 w-4" />
      </span>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: AssistantMessage }) {
  const active = msg.status === 'streaming';
  // The agent is "working" (pre-answer) when it has thoughts/tools but no text yet.
  const working = active && msg.answer.length === 0;

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {/* 思考过程 */}
        <ThoughtTrace thoughts={msg.thoughts} active={active} />

        {/* 工具调用 */}
        {msg.toolCalls.map((c) => (
          <ToolCallCard
            key={c.id}
            tool={c.tool}
            args={c.args}
            result={c.result}
            pending={active && c.result === undefined}
          />
        ))}

        {/* 工作中占位（尚无回答 token 时） */}
        {working && msg.thoughts.length === 0 && msg.toolCalls.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Brain className="h-4 w-4 animate-pulse" />
            正在思考…
          </div>
        )}

        {/* 最终回答（打字机流式） */}
        {msg.answer && (
          <div className="text-sm">
            <RichText text={msg.answer} />
            {active && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-middle" />
            )}
          </div>
        )}

        {/* 错误 */}
        {msg.status === 'error' && (
          <div className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {msg.error || '发生错误，请重试。'}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Composer ------------------------------------------------------------

function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) onSend();
    }
  }

  const canSend = value.trim().length > 0 && !streaming;

  return (
    <div className="mt-4">
      <div className="flex items-end gap-2 rounded-lg border border-hairline bg-canvas p-2 shadow-card focus-within:border-ink">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={streaming}
          placeholder={streaming ? '智能体回答中…' : '输入问题，Enter 发送 · Shift+Enter 换行'}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none disabled:opacity-60"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            title="停止"
          >
            <Square className="h-4 w-4" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-on-primary transition-colors hover:bg-brand-700 disabled:opacity-40"
            title="发送"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-center text-xs text-muted-soft">
        智能体可能会犯错，请核对关键信息。
      </p>
    </div>
  );
}
