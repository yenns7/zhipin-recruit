import type { ChatTurn } from '../../lib/agent';
import type { Message } from '../../lib/agentChat';
import type { Role } from '../../types';

export const AGENT_EMPTY_STATE_EXAMPLES: Record<Exclude<Role, 'interviewer'>, string[]> = {
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

export function buildAgentHistory(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.kind === 'user') {
      turns.push({ role: 'user', content: message.text });
      continue;
    }

    if (message.status !== 'done' || (!message.answer && !message.toolCalls.length && !message.thoughts.length)) {
      continue;
    }

    const parts: string[] = [];
    if (message.thoughts.length) {
      parts.push(`[上轮思考] ${message.thoughts.slice(-3).join('；')}`);
    }
    if (message.toolCalls.length) {
      const toolSummary = message.toolCalls
        .slice(-4)
        .map((call) => {
          const argBrief = Object.entries(call.args)
            .slice(0, 2)
            .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
            .join(',');
          return `${call.tool}(${argBrief})`;
        })
        .join('；');
      parts.push(`[上轮工具调用] ${toolSummary}`);
    }
    if (message.answer) parts.push(message.answer);
    turns.push({ role: 'assistant', content: parts.join('\n') });
  }
  return turns;
}
