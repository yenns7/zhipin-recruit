// BOSS 账号导入区：从浏览器导入 Cookie。
//
// 招聘端 Web API 需要浏览器 cookie（wt2/wbg/zp_at），QR 扫码拿到的是移动端 cookie 无效。
// 主路径：Chrome 扩展一键采集 Cookie 或手动从开发者工具复制粘贴。
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardBody, Input, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type { BossAccount } from '../../../types';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

export function BossAccountManager({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<BossAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.bossAccounts();
      setAccounts(list);
    } catch (e) {
      toast.error(errMsg(e, '加载账号列表失败'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const activeAccount = accounts.find((a) => a.is_active) || null;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {loading ? (
              <Spinner size="sm" />
            ) : activeAccount ? (
              <>
                <Badge tone="success">已激活</Badge>
                <div className="text-body-sm">
                  <span className="font-medium text-text-primary">{activeAccount.label || '未命名账号'}</span>
                  <span className="ml-2 text-text-muted">{activeAccount.cookie_count} cookies</span>
                </div>
              </>
            ) : (
              <Badge tone="warning">未绑定账号</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setPasteOpen(true)}>
              从浏览器导入
            </Button>
          </div>
        </div>

        {pasteOpen && (
          <BrowserCookiePasteModal
            onClose={() => setPasteOpen(false)}
            onSuccess={async () => { setPasteOpen(false); await refresh(); onChanged?.(); }}
          />
        )}
      </CardBody>
    </Card>
  );
}

// ── 浏览器 Cookie 导入弹窗（扩展采集 + 手动粘贴）───────────────────
function BrowserCookiePasteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [cookies, setCookies] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'tutorial' | 'paste'>('tutorial');

  const handleSave = useCallback(async () => {
    const raw = cookies.trim();
    if (!raw) { toast.error('请先粘贴从浏览器复制的 Cookie'); return; }
    setSaving(true);
    try {
      await api.bossImportBrowserCookie(raw, label.trim() || `账号${new Date().toLocaleDateString()}`);
      toast.success('账号已导入并激活');
      onSuccess();
    } catch (e) {
      toast.error(errMsg(e, '导入失败，请确认 Cookie 完整且未过期'));
    } finally { setSaving(false); }
  }, [cookies, label, onSuccess, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-sm font-semibold text-text-primary">从浏览器导入 BOSS 账号</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>

          {step === 'tutorial' && (
            <>
              {/* 方式一：Chrome 扩展（推荐） */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-blue-800">
                  <span>🧩</span> 方式一：Chrome 扩展一键采集（推荐）
                </div>
                <ol className="list-decimal space-y-2 pl-5 text-body-sm text-blue-900">
                  <li>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">下载扩展并解压</span>
                      <Button size="sm" variant="ghost" onClick={() => window.open(api.bossExtensionDownloadUrl(), '_blank')}>
                        📥 下载 ZIP
                      </Button>
                    </div>
                    <div className="text-caption text-blue-700 mt-0.5">双击 ZIP 自动解压，得到 <code className="bg-blue-100 px-1 rounded">boss-cookie-extension</code> 文件夹</div>
                  </li>
                  <li>
                    <div>
                      Chrome 地址栏输入{' '}
                      <code
                        className="cursor-pointer rounded bg-blue-100 px-1.5 py-0.5 text-caption font-mono underline decoration-blue-400 hover:bg-blue-200"
                        onClick={() => { navigator.clipboard.writeText('chrome://extensions'); toast.success('已复制，粘贴到地址栏即可'); }}
                        title="点击复制"
                      >chrome://extensions</code>
                      ，开启「<span className="font-medium">开发者模式</span>」
                    </div>
                  </li>
                  <li>
                    <div>把解压后的 <code className="bg-blue-100 px-1 rounded">boss-cookie-extension</code> 文件夹<span className="font-medium">直接拖进 Chrome 扩展页面</span>即可安装（或点「加载已解压的扩展程序」选择文件夹）</div>
                  </li>
                  <li>
                    <div>打开 <a href="https://www.zhipin.com/web/chat/recommend" target="_blank" rel="noopener" className="underline decoration-blue-400 hover:text-blue-600">BOSS 直聘招聘端</a> 并登录，点一下「推荐」或「沟通」</div>
                  </li>
                  <li>
                    <div>点浏览器右上角扩展图标 →「<span className="font-medium">🚀 一键发送到智聘</span>」即可自动导入</div>
                    <div className="text-caption text-blue-700 mt-0.5">首次使用需在扩展设置中配置智聘地址和登录 Token</div>
                  </li>
                </ol>
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setStep('paste')}>
                    或手动复制粘贴 →
                  </Button>
                </div>
              </div>

              {/* 方式二：手动复制 */}
              <div className="rounded-lg border border-hairline p-4 space-y-3">
                <div className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
                  <span>📋</span> 方式二：手动从开发者工具复制
                </div>
                <ol className="list-decimal space-y-2 pl-5 text-body-sm text-text-secondary">
                  <li>在浏览器打开 BOSS 直聘招聘端并登录</li>
                  <li>
                    按 <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-caption font-mono">F12</kbd> 打开开发者工具
                    → <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-caption font-mono">Network</kbd> 标签
                  </li>
                  <li>在页面点一下「推荐」或「沟通」，触发一个请求</li>
                  <li>点击该请求 → <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-caption font-mono">Headers</kbd> → 找到 <code className="bg-gray-100 px-1 rounded">Cookie:</code> 行 → 右键复制整行值</li>
                </ol>
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setStep('paste')}>
                    已复制，去粘贴 →
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 'paste' && (
            <>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep('tutorial')}>← 返回教程</Button>
              </div>
              <div className="rounded-lg bg-surface-soft px-3 py-2 text-body-sm text-text-secondary">
                粘贴从浏览器扩展或开发者工具复制的 Cookie，后端会自动校验完整性与登录态。
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-body-sm font-medium text-text-primary block mb-1.5">Cookie</label>
                  <textarea
                    className="h-28 w-full rounded-lg border border-hairline p-2 font-mono text-caption"
                    placeholder="wt2=...; wbg=...; zp_at=..."
                    value={cookies}
                    onChange={(e) => setCookies(e.target.value)}
                  />
                </div>
                <Input label="账号别名（可选）" placeholder="如：主账号" value={label} onChange={(e) => setLabel(e.target.value)} />
                <Button className="w-full" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
