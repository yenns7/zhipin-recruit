import { Check, Loader2, X } from 'lucide-react';
import { toolMeta } from '../../lib/agent';
import type { WriteProposal } from '../../lib/agentChat';
import { ErrorState } from '../ui';

interface ConfirmCardProps {
  proposal: WriteProposal;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ proposal, onConfirm, onCancel }: ConfirmCardProps) {
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
          <p className="text-sm font-medium text-ink">人工确认：{meta.label}</p>
          <p className="mt-0.5 text-sm text-body">{proposal.summary}</p>
          <p className="mt-1 text-xs text-muted-soft">
            确认后才会写入系统，取消不会改动数据。
          </p>

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
            <ErrorState className="mt-3 px-2.5 py-1 text-xs" message={proposal.resultText || '执行失败'} />
          )}
          {proposal.status === 'cancelled' && (
            <div className="mt-3 text-xs text-muted-soft">已取消</div>
          )}
        </div>
      </div>
    </div>
  );
}
