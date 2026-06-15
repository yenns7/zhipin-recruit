// Agent feature support: SSE event types, the fetch-based streaming client,
// and tool metadata (Chinese labels + icons) for the AI assistant page.
//
// EventSource can't send an Authorization header, so the agent chat endpoint is
// consumed via fetch + ReadableStream and the SSE wire format is parsed by hand.

import {
  BarChart3,
  Briefcase,
  Gauge,
  KanbanSquare,
  Target,
  UserCircle,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { getToken } from './api';

// ---- Wire types ----------------------------------------------------------

// One conversation turn as sent back to the backend for multi-turn context.
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// A single tool advertised by GET /api/agent/tools.
export interface AgentTool {
  name: string;
  description: string;
  params: Record<string, unknown>;
}

// A write tool (mutates data) — carries rbac roles and a write flag.
export interface AgentWriteTool extends AgentTool {
  rbac: string[];
  write: true;
}

export interface AgentToolsResponse {
  tools: AgentTool[];
  write_tools?: AgentWriteTool[];
}

// Discriminated union of every SSE event the chat endpoint can emit.
export type AgentEvent =
  | { type: 'conversation_started'; id: number }
  | { type: 'thought'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'confirm_required'; tool: string; args: Record<string, unknown>; summary: string }
  | { type: 'token'; text: string }
  | { type: 'done'; answer: string }
  | { type: 'error'; message: string };

// ---- Tool metadata -------------------------------------------------------

export interface ToolMeta {
  label: string;
  icon: LucideIcon;
}

// Static Chinese labels + icons for the 7 known tools. Unknown tools fall back
// to a generic wrench + the raw name so the UI never breaks on new tools.
const TOOL_META: Record<string, ToolMeta> = {
  list_candidates: { label: '候选人列表', icon: Users },
  get_candidate: { label: '候选人详情', icon: UserCircle },
  list_jobs: { label: '岗位列表', icon: Briefcase },
  match_candidates_for_job: { label: '岗位匹配候选人', icon: Target },
  get_pipeline: { label: '招聘流程', icon: KanbanSquare },
  get_bi_overview: { label: '团队报表', icon: BarChart3 },
  count_summary: { label: '系统概览', icon: Gauge },
  // 写操作工具
  create_job: { label: '创建岗位', icon: Briefcase },
  move_pipeline: { label: '推进流程', icon: KanbanSquare },
  start_interview: { label: '发起面试', icon: Target },
  run_match: { label: '运行匹配', icon: Target },
};

export function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { label: name, icon: Wrench };
}

// ---- Write-tool execution (after user confirmation) ----------------------

export interface ExecuteWriteResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

// Execute a write tool the agent proposed, once the user confirms.
// Hits POST /api/agent/execute which enforces RBAC server-side.
export async function executeWriteTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ExecuteWriteResult> {
  const token = getToken();
  const resp = await fetch('/api/agent/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tool, args }),
  });
  const data = (await resp.json().catch(() => ({}))) as ExecuteWriteResult;
  if (!resp.ok) {
    return { ok: false, error: data.error || `执行失败 (HTTP ${resp.status})` };
  }
  return data;
}

// ---- Streaming client ----------------------------------------------------

export interface StreamChatParams {
  message: string;
  history: ChatTurn[];
  conversationId?: number | null;
  signal?: AbortSignal;
}

// POST the message + history and invoke `onEvent` for each parsed SSE event.
// Resolves when the stream ends; rejects on network/HTTP failure or abort.
// Parsing handles SSE chunks that split mid-event across reads by buffering the
// trailing partial block until the next chunk completes it.
export async function streamChat(
  { message, history, conversationId, signal }: StreamChatParams,
  onEvent: (event: AgentEvent) => void
): Promise<void> {
  const token = getToken();
  const body: Record<string, unknown> = { message, history };
  if (conversationId) body.conversation_id = conversationId;
  const resp = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok || !resp.body) {
    let detail = `请求失败 (HTTP ${resp.status})`;
    try {
      const data = (await resp.json()) as { error?: string; message?: string };
      detail = data.error || data.message || detail;
    } catch {
      // Non-JSON error body — keep the status-code message.
    }
    throw new Error(detail);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // SSE events are separated by a blank line ("\n\n").
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    // The last segment may be an incomplete event; keep it for the next read.
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      emitBlock(block, onEvent);
    }
  }

  // Flush any trailing event left in the buffer when the stream closed.
  if (buffer.trim()) {
    emitBlock(buffer, onEvent);
  }
}

// Parse a single SSE block ("data: {json}") and forward a typed event.
// A block may carry multiple `data:` lines; malformed JSON is skipped quietly.
function emitBlock(block: string, onEvent: (event: AgentEvent) => void): void {
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(line.indexOf(':') + 1).trim();
    if (!payload) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    if (isAgentEvent(parsed)) {
      onEvent(parsed);
    }
  }
}

// Narrow an unknown parsed value to AgentEvent before dispatching.
function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'thought' ||
    type === 'conversation_started' ||
    type === 'tool_call' ||
    type === 'tool_result' ||
    type === 'confirm_required' ||
    type === 'token' ||
    type === 'done' ||
    type === 'error'
  );
}

// Fetch the agent's tool catalogue for the capability cloud. Failures are
// swallowed by the caller — the cloud is a nice-to-have, not load-bearing.
export async function fetchAgentTools(signal?: AbortSignal): Promise<AgentTool[]> {
  const token = getToken();
  const resp = await fetch('/api/agent/tools', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!resp.ok) {
    throw new Error(`无法获取工具列表 (HTTP ${resp.status})`);
  }
  const data = (await resp.json()) as AgentToolsResponse;
  return Array.isArray(data.tools) ? data.tools : [];
}
