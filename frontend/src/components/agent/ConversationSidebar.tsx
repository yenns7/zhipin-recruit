import { useState } from 'react';
import { MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ConversationSummary } from '../../types';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  currentId: number | null;
  streaming: boolean;
  onSwitch: (id: number) => void;
  onCreate: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}

export function ConversationSidebar({
  conversations,
  currentId,
  streaming,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
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
