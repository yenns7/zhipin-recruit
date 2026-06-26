// AI 助手 — 智能体对话页。
// 通过 fetch + ReadableStream 消费后端 SSE 流，逐步展示智能体的完整工作过程：
// 思考(thought) → 调用工具(tool_call) → 拿到数据(tool_result) → 流式回答(token)。
// 维护多轮 history，每次请求带上历史消息实现连续对话。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Bot, Brain, Sparkles, Square, User, Check, X, Loader2,
  Plus, MessageSquare, Trash2, Pencil, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import {
  fetchAgentTools,
  streamChat,
  executeWriteTool,
  toolMeta,
  type AgentEvent,
  type AgentTool,
  type ChatTurn,
} from '../lib/agent';
import {
  useAgentChat,
  type Message,
  type UserMessage,
  type AssistantMessage,
  type WriteProposal,
} from '../lib/agentChat';
import { cn } from '../lib/cn';
import { RichText } from '../components/agent/RichText';
import { ThoughtTrace } from '../components/agent/ThoughtTrace';
import { ToolCallCard } from '../components/agent/ToolCallCard';
import { useAuth } from '../lib/auth';
import type { Role, ConversationSummary } from '../types';

// View-model types now live in ../lib/agentChat (shared with the Context that
// holds conversation state across route switches).

// Example prompts surfaced when the conversation is empty.
const EXAMPLES_BY_ROLE: Record<Exclude<Role, 'interviewer'>, string[]> = {
  recruiter: [
    '我负责的候选人现在卡在哪些阶段？',
    '列出我负责岗位的待反馈候选人',
    '帮我找还没进入流程的高分候选人',
    '今天有哪些面试反馈需要跟进？',
  ],
  manager: [
    '看看团队招聘漏斗报表',
    '哪些岗位卡在业务反馈？',
    '本月各招聘专员推进情况如何？',
    '有哪些逾期未反馈的面试？',
  ],
  admin: [
    '系统里有哪些岗位和候选人？',
    '查看最近有哪些审计和权限相关操作',
    '当前有哪些流程卡点？',
    '解释一下 AI 写操作确认机制',
  ],
};

let idSeq = Date.now();
const nextId = () => ++idSeq;

export function AgentPage() {
  const { role } = useAuth();
  // 对话状态来自 Context（挂在 AppShell Outlet 之上），跨路由切换不丢失。
  const {
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
    conversations,
    switchConversation,
    createNewConversation,
    renameConversation,
    archiveConversation,
  } = useAgentChat();
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Build the history payload (user/assistant pairs) from completed turns.
  // 多轮上下文回传 tool_calls/thoughts 摘要（控 token），让 LLM 知道上一轮查了什么、
  // 想了什么，避免重复调工具或上下文断裂（对应计划 T10）。
  const buildHistory = useCallback((msgs: Message[]): ChatTurn[] => {
    const turns: ChatTurn[] = [];
    for (const m of msgs) {
      if (m.kind === 'user') {
        turns.push({ role: 'user', content: m.text });
      } else if (m.status === 'done' && (m.answer || m.toolCalls.length || m.thoughts.length)) {
        // 把上一轮的工具调用与思考摘要附在回答前，供 LLM 续接上下文
        const parts: string[] = [];
        if (m.thoughts.length) {
          parts.push(`[上轮思考] ${m.thoughts.slice(-3).join('；')}`);
        }
        if (m.toolCalls.length) {
          const toolSummary = m.toolCalls
            .slice(-4)
            .map((c) => {
              const argBrief = Object.entries(c.args)
                .slice(0, 2)
                .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                .join(',');
              return `${c.tool}(${argBrief})`;
            })
            .join('；');
          parts.push(`[上轮工具调用] ${toolSummary}`);
        }
        if (m.answer) parts.push(m.answer);
        turns.push({ role: 'assistant', content: parts.join('\n') });
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
          case 'conversation_started':
            return m;
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
          case 'confirm_required':
            return {
              ...m,
              proposal: {
                tool: ev.tool,
                args: ev.args,
                summary: ev.summary,
                status: 'pending',
              },
            };
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
  }, [setMessages, toolSeqRef]);

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
          { message: text, history, conversationId, signal: controller.signal },
          (ev) => {
            if (ev.type === 'conversation_started') {
              setConversationId(ev.id);
              return;
            }
            applyEvent(assistantId, ev);
          }
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
    [
      streaming,
      messages,
      conversationId,
      setConversationId,
      buildHistory,
      applyEvent,
      abortRef,
      setInput,
      setMessages,
      setStreaming,
    ]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, [abortRef]);

  // Confirm (or cancel) a write proposal on a specific assistant message.
  const resolveProposal = useCallback(
    async (assistantId: number, confirm: boolean) => {
      // 直接从当前 messages 读取目标 proposal —— 不依赖 setMessages updater 的
      // 副作用赋值（React 批处理下 updater 可能延后执行，导致此处快照为 undefined，
      // 函数提前 return，请求永不发出 → 确认卡片永久停在「执行中」）。
      const targetMsg = messages.find(
        (m): m is AssistantMessage =>
          m.kind === 'assistant' && m.id === assistantId && !!m.proposal
      );
      const target = targetMsg?.proposal;
      if (!target) return;

      // 标记状态：确认 → executing；取消 → cancelled。
      setMessages((prev) =>
        prev.map((m) =>
          m.kind === 'assistant' && m.id === assistantId && m.proposal
            ? { ...m, proposal: { ...m.proposal, status: confirm ? 'executing' : 'cancelled' } }
            : m
        )
      );
      if (!confirm) return;

      try {
        const res = await executeWriteTool(target.tool, target.args, conversationId);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.kind !== 'assistant' || m.id !== assistantId || !m.proposal) return m;
            if (res.ok) {
              const r = res.result || {};
              const jid = r.job_id ?? r.candidate_id;
              return {
                ...m,
                proposal: {
                  ...m.proposal,
                  status: 'done',
                  resultText: jid ? `操作成功（#${jid}）` : '操作成功',
                },
              };
            }
            return {
              ...m,
              proposal: { ...m.proposal, status: 'failed', resultText: res.error || '执行失败' },
            };
          })
        );
      } catch (err) {
        // 网络/异常也要落地为 failed，绝不留在 executing 卡死。
        setMessages((prev) =>
          prev.map((m) =>
            m.kind === 'assistant' && m.id === assistantId && m.proposal
              ? {
                  ...m,
                  proposal: {
                    ...m.proposal,
                    status: 'failed',
                    resultText: err instanceof Error ? err.message : '执行失败',
                  },
                }
              : m
          )
        );
      }
    },
    [messages, setMessages, conversationId]
  );

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
  useEffect(() => () => abortRef.current?.abort(), [abortRef]);

  // Auto-scroll to the bottom as content streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isEmpty = messages.length === 0;
  const examples =
    role && role !== 'interviewer'
      ? EXAMPLES_BY_ROLE[role]
      : EXAMPLES_BY_ROLE.recruiter;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* 页头 */}
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-canvas text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            title={sidebarOpen ? '收起会话列表' : '展开会话列表'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-display text-ink">AI 助手</h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-soft px-2.5 py-0.5 text-xs font-medium text-muted">
                <Sparkles className="h-3 w-3" />
                DeepSeek v4 驱动
              </span>
            </div>
            <p className="text-sm text-muted">
              用自然语言查询候选人、岗位、匹配、流程和团队报表 · 涉及写入时必须人工确认
            </p>
          </div>
        </div>
      </div>

      {/* 主体：侧边栏 + 对话区 */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {sidebarOpen && (
          <ConversationSidebar
            conversations={conversations}
            currentId={conversationId}
            streaming={streaming}
            onSwitch={switchConversation}
            onCreate={() => createNewConversation()}
            onRename={renameConversation}
            onDelete={(id) => archiveConversation(id, true)}
          />
        )}

        {/* 消息区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-lg border border-hairline bg-canvas"
        >
          {isEmpty ? (
            <EmptyState tools={tools} examples={examples} onPick={send} disabled={streaming} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-5 py-6">
              {messages.map((m) =>
                m.kind === 'user' ? (
                  <UserBubble key={m.id} text={m.text} />
                ) : (
                  <AssistantBubble
                    key={m.id}
                    msg={m}
                    onConfirm={() => resolveProposal(m.id, true)}
                    onCancel={() => resolveProposal(m.id, false)}
                  />
                )
              )}
            </div>
          )}
        </div>
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

// ---- Conversation sidebar (history list) --------------------------------

function ConversationSidebar({
  conversations,
  currentId,
  streaming,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  currentId: number | null;
  streaming: boolean;
  onSwitch: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menuId, setMenuId] = useState<number | null>(null);

  function startRename(c: ConversationSummary) {
    setEditingId(c.id);
    setEditValue(c.title);
    setMenuId(null);
  }

  function commitRename() {
    if (editingId !== null && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col rounded-lg border border-hairline bg-surface-soft">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-soft">
          会话历史
        </span>
        <button
          type="button"
          onClick={onCreate}
          disabled={streaming}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-on-primary transition-colors hover:bg-brand-700 disabled:opacity-40"
          title="新建会话"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-soft">
            还没有会话
            <br />
            点击上方 + 开始
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === currentId;
            const editing = editingId === c.id;
            return (
              <div
                key={c.id}
                className={cn(
                  'group relative mx-1.5 mb-0.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-surface-card text-ink'
                    : 'text-body hover:bg-surface-card/60',
                )}
              >
                {editing ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full rounded border border-hairline bg-canvas px-1.5 py-0.5 text-sm text-ink focus:border-ink focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSwitch(c.id)}
                    disabled={streaming || active}
                    className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  </button>
                )}

                {/* 操作菜单触发 */}
                {!editing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(menuId === c.id ? null : c.id);
                    }}
                    className={cn(
                      'absolute right-1 top-1.5 flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-surface-strong hover:text-ink',
                      'group-hover:opacity-100',
                      menuId === c.id && 'opacity-100',
                    )}
                    title="更多操作"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}

                {/* 下拉菜单 */}
                {menuId === c.id && !editing && (
                  <div className="absolute right-1 top-7 z-10 w-28 rounded-md border border-hairline bg-canvas py-1 shadow-card">
                    <button
                      type="button"
                      onClick={() => startRename(c)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-body hover:bg-surface-soft"
                    >
                      <Pencil className="h-3 w-3" /> 重命名
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        if (confirm(`删除会话「${c.title}」？删除后可在归档列表恢复。`)) {
                          onDelete(c.id);
                        }
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-danger-700 hover:bg-danger-50"
                    >
                      <Trash2 className="h-3 w-3" /> 删除
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {streaming && (
        <div className="border-t border-hairline px-3 py-1.5 text-xs text-muted-soft">
          生成中，暂不可切换
        </div>
      )}
    </aside>
  );
}

// ---- Empty state: capability hints --------------------------------------

function EmptyState({
  tools,
  examples,
  onPick,
  disabled,
}: {
  tools: AgentTool[];
  examples: string[];
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
        我可以查询系统数据、整理参考建议；需要改数据时，会先等你人工确认。
      </p>

      {/* 示例问题 */}
      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {examples.map((q) => (
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

function AssistantBubble({
  msg,
  onConfirm,
  onCancel,
}: {
  msg: AssistantMessage;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

        {/* 写操作确认卡片 */}
        {msg.proposal && (
          <ConfirmCard
            proposal={msg.proposal}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
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

// ---- Write-operation confirm card ----------------------------------------

function ConfirmCard({
  proposal,
  onConfirm,
  onCancel,
}: {
  proposal: WriteProposal;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = toolMeta(proposal.tool);
  const Icon = meta.icon;
  const pending = proposal.status === 'pending';
  const executing = proposal.status === 'executing';

  return (
    <div className="rounded-lg border border-warning-200 bg-warning-50 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning-100 text-warning-700">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            人工确认：{meta.label}
          </p>
          <p className="mt-0.5 text-sm text-body">{proposal.summary}</p>
          <p className="mt-1 text-xs text-muted-soft">
            确认后才会写入系统，取消不会改动数据。
          </p>

          {/* 参数明细 */}
          <div className="mt-2 space-y-0.5">
            {Object.entries(proposal.args).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="shrink-0 font-medium text-muted">{k}:</span>
                <span className="break-all text-body">
                  {typeof v === 'string' ? v : JSON.stringify(v)}
                </span>
              </div>
            ))}
          </div>

          {/* 操作区 / 状态 */}
          {pending && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-brand-700"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                确认执行
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
                取消
              </button>
            </div>
          )}
          {executing && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              执行中…
            </div>
          )}
          {proposal.status === 'done' && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              {proposal.resultText || '操作成功'}
            </div>
          )}
          {proposal.status === 'failed' && (
            <div className="mt-3 rounded-md bg-danger-50 px-2.5 py-1 text-xs text-danger-700">
              {proposal.resultText || '执行失败'}
            </div>
          )}
          {proposal.status === 'cancelled' && (
            <div className="mt-3 text-xs text-muted-soft">已取消</div>
          )}
        </div>
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
        AI 只作参考，关键操作请人工确认。
      </p>
    </div>
  );
}
