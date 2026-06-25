// 账户设置弹窗 — 修改密码。从 AppShell 顶栏用户区触发。
// 复用 Input/Button/ErrorState 基元，遵循近黑风格与无障碍。

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Input, ErrorState } from './ui';

export function AccountSettings({ onClose }: { onClose: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPw !== confirmPw) {
      setError('两次输入的新密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await api.changePassword(oldPw, newPw);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="账户设置"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-hairline bg-canvas shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline-soft px-5 py-4">
          <h2 className="text-base font-display text-ink">修改密码</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {done ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700">
                密码修改成功
              </div>
              <Button className="w-full" onClick={onClose}>
                完成
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="当前密码"
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Input
                label="新密码"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="至少 6 位"
              />
              <Input
                label="确认新密码"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
              />
              {error && <ErrorState message={error} />}
              <Button type="submit" className="w-full" loading={submitting} disabled={submitting}>
                {submitting ? '提交中…' : '确认修改'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
