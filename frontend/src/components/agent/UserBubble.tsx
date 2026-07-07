import { User } from 'lucide-react';

interface UserBubbleProps {
  text: string;
}

export function UserBubble({ text }: UserBubbleProps) {
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
