import { Bot, Brain } from 'lucide-react';
import type { AssistantMessage } from '../../lib/agentChat';
import { ErrorState } from '../ui';
import { ConfirmCard } from './ConfirmCard';
import { RichText } from './RichText';
import { ThoughtTrace } from './ThoughtTrace';
import { ToolCallCard } from './ToolCallCard';

interface AssistantBubbleProps {
  msg: AssistantMessage;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AssistantBubble({ msg, onConfirm, onCancel }: AssistantBubbleProps) {
  const active = msg.status === 'streaming';
  const working = active && msg.answer.length === 0;

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <ThoughtTrace thoughts={msg.thoughts} active={active} />

        {msg.toolCalls.map((c) => (
          <ToolCallCard
            key={c.id}
            tool={c.tool}
            args={c.args}
            result={c.result}
            pending={active && c.result === undefined}
          />
        ))}

        {working && msg.thoughts.length === 0 && msg.toolCalls.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Brain className="h-4 w-4 animate-pulse" />
            正在思考…
          </div>
        )}

        {msg.answer && (
          <div className="text-sm">
            <RichText text={msg.answer} />
            {active && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-middle" />
            )}
          </div>
        )}

        {msg.proposal && (
          <ConfirmCard proposal={msg.proposal} onConfirm={onConfirm} onCancel={onCancel} />
        )}

        {msg.status === 'error' && (
          <ErrorState className="px-3 py-2" message={msg.error || '发生错误，请重试。'} />
        )}
      </div>
    </div>
  );
}
