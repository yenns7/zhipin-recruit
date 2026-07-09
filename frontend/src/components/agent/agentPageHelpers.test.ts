import { describe, expect, it } from 'vitest';
import type { AssistantMessage, UserMessage } from '../../lib/agentChat';
import { AGENT_EMPTY_STATE_EXAMPLES, buildAgentHistory } from './agentPageHelpers';

describe('agentPageHelpers', () => {
  it('summarizes completed assistant turns into chat history with recent thoughts and tool calls', () => {
    const messages: Array<UserMessage | AssistantMessage> = [
      { kind: 'user', id: 1, text: '帮我看一下候选人情况' },
      {
        kind: 'assistant',
        id: 2,
        thoughts: ['先查候选人', '再补岗位匹配', '最后总结'],
        toolCalls: [
          { id: 1, tool: 'list_candidates', args: { limit: 10 } },
          { id: 2, tool: 'match_candidates_for_job', args: { jobId: 7, page: 1 } },
        ],
        answer: '有 3 位高分候选人还没进入流程。',
        status: 'done',
      },
    ];

    expect(buildAgentHistory(messages)).toEqual([
      { role: 'user', content: '帮我看一下候选人情况' },
      {
        role: 'assistant',
        content:
          '[上轮思考] 先查候选人；再补岗位匹配；最后总结\n[上轮工具调用] list_candidates(limit=10)；match_candidates_for_job(jobId=7,page=1)\n有 3 位高分候选人还没进入流程。',
      },
    ]);
  });

  it('exposes starter examples for each writable dashboard role', () => {
    expect(AGENT_EMPTY_STATE_EXAMPLES.recruiter).toContain('我负责的候选人现在卡在哪些阶段？');
    expect(AGENT_EMPTY_STATE_EXAMPLES.manager).toContain('看看团队招聘漏斗报表');
    expect(AGENT_EMPTY_STATE_EXAMPLES.admin).toContain('解释一下 AI 写操作确认机制');
  });
});
