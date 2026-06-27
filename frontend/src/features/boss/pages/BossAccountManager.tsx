// BOSS 账号管理区：从浏览器导入账号（推荐）+ 扫码登录（实验性降级）+ 多账号切换/校验/删除。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, CardBody, Input, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type { BossAccount, BossQrStatus } from '../../../types';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

export function BossAccountManager({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState<BossAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supplementTarget, setSupplementTarget] = useState<{ id: number; label: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

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

  const handleActivate = useCallback(async (id: number) => {
    try {
      await api.bossActivateAccount(id);
      toast.success('已切换激活账号');
      await refresh();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, '切换失败')); }
  }, [refresh, toast, onChanged]);

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('确认删除该 BOSS 账号？')) return;
    try {
      await api.bossDeleteAccount(id);
      toast.success('已删除账号');
      await refresh();
      onChanged?.();
    } catch (e) { toast.error(errMsg(e, '删除失败')); }
  }, [refresh, toast, onChanged]);

  const handleVerify = useCallback(async (id: number) => {
    try {
      const r = await api.bossVerifyAccount(id);
      toast.success(r.authenticated ? '账号登录态正常' : '账号未登录或已失效');
      await refresh();
    } catch (e) { toast.error(errMsg(e, '校验失败')); }
  }, [refresh, toast]);

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
                  <span className="ml-2 text-text-muted">
                    {activeAccount.cookie_count} cookies
                    {activeAccount.has_stoken ? ' · 含 stoken' : ' · 缺 stoken'}
                  </span>
                </div>
              </>
            ) : (
              <Badge tone="warning">未绑定账号</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setImportOpen(true)}>从浏览器导入账号</Button>
            <button
              type="button"
              className="text-caption text-text-muted underline underline-offset-2 hover:text-text-secondary"
              onClick={() => setQrOpen(true)}
            >
              扫码登录
            </button>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2">
                <div className="flex items-center gap-2 text-body-sm">
                  {a.is_active && <Badge tone="success">激活中</Badge>}
                  <span className="font-medium text-text-primary">{a.label || '未命名'}</span>
                  <span className="text-text-muted">{a.cookie_count} cookies{a.has_stoken ? ' · 含 stoken' : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  {!a.is_active && <Button variant="ghost" size="sm" onClick={() => handleActivate(a.id)}>切换</Button>}
                  {!a.has_stoken && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setGuideOpen(true)}>安装扩展</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSupplementTarget({ id: a.id, label: a.label || '未命名' })}>补全 Cookie</Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleVerify(a.id)}>校验</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {importOpen && (
          <BrowserCookieImportModal
            onClose={() => setImportOpen(false)}
            onSuccess={async () => { setImportOpen(false); await refresh(); onChanged?.(); }}
          />
        )}

        {qrOpen && (
          <QrLoginModal
            onClose={() => setQrOpen(false)}
            onSuccess={async () => { setQrOpen(false); await refresh(); onChanged?.(); }}
          />
        )}

        {supplementTarget && (
          <SupplementCookieModal
            accountId={supplementTarget.id}
            accountLabel={supplementTarget.label}
            onClose={() => setSupplementTarget(null)}
            onSuccess={async () => { setSupplementTarget(null); await refresh(); onChanged?.(); }}
          />
        )}

        {guideOpen && (
          <ExtensionGuideModal
            onClose={() => setGuideOpen(false)}
            onSuccess={async () => { setGuideOpen(false); await refresh(); onChanged?.(); }}
          />
        )}
      </CardBody>
    </Card>
  );
}

// ── 从浏览器导入账号弹窗（推荐）─────────────────────────────────────
// 云部署下后端读不到用户本机浏览器，需用户用扩展采集完整 cookie 后粘贴。
function BrowserCookieImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [cookies, setCookies] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const raw = cookies.trim();
    if (!raw) { toast.error('请先粘贴从浏览器扩展采集的 Cookie'); return; }
    setSaving(true);
    try {
      await api.bossImportBrowserCookie(raw, label.trim() || `账号${new Date().toLocaleDateString()}`);
      toast.success('账号已导入并激活');
      onSuccess();
    } catch (e) {
      // 后端缺 __zp_stoken__ 返回 needs_stoken；缺其他 cookie 返回 incomplete_cookie
      toast.error(errMsg(e, '导入失败，请确认已采集完整 Cookie'));
    } finally { setSaving(false); }
  }, [cookies, label, onSuccess, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-sm font-semibold text-text-primary">从浏览器导入 BOSS 账号</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-body-sm text-text-secondary">
            <li>在本机浏览器登录 <span className="font-medium">BOSS 直聘招聘端</span>（zhipin.com）。</li>
            <li>安装并点击「智聘 · BOSS Cookie 采集器」扩展，点「一键采集并复制」。</li>
            <li>把复制的 Cookie 粘贴到下方输入框后保存。</li>
          </ol>
          <div className="rounded-lg bg-warning-50 px-3 py-2 text-caption text-text-secondary">
            扫码登录已可满足大部分招聘需求。如需完整搜索能力，可手动从浏览器开发者工具复制 Cookie 粘贴到下方（需包含 <code>__zp_stoken__</code>）。
          </div>
          <div className="space-y-2">
            <label className="text-body-sm font-medium text-text-primary">粘贴 Cookie</label>
            <textarea
              className="h-28 w-full rounded-lg border border-hairline p-2 font-mono text-caption"
              placeholder="__zp_stoken__=...; wt2=...; wbg=...; zp_at=..."
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
            />
            <Input label="账号别名" placeholder="如：主账号" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? '校验并保存中…' : '校验并保存'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── 扫码登录弹窗 ─────────────────────────────────────────────────
function QrLoginModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [sessionId, setSessionId] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [qrMime, setQrMime] = useState('image/png');
  const [status, setStatus] = useState<BossQrStatus | ''>('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLogin = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const r = await api.bossQrLoginStart();
      setSessionId(r.session_id);
      setQrImage(r.qr_image);
      setQrMime(r.qr_mime || 'image/png');
    } catch (e) {
      toast.error(errMsg(e, '获取二维码失败'));
    } finally {
      // 无论成功失败都要结束 loading，否则成功路径下二维码永远被 Spinner 遮住
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { startLogin(); }, [startLogin]);

  useEffect(() => {
    if (!sessionId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.bossQrLoginStatus(sessionId);
        setStatus(r.status);
        if (r.status === 'done' || r.status === 'expired' || r.status === 'failed') {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          if (r.status === 'expired') toast.error('二维码已过期');
          if (r.status === 'failed') toast.error('登录失败：' + (r.error || ''));
          if (r.status === 'done') toast.success('扫码登录成功');
        }
      } catch { /* 静默 */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, toast]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      const result = await api.bossQrLoginConfirm(sessionId, label.trim() || `账号${new Date().toLocaleDateString()}`);
      if (result.warning) {
        // 缺 stoken 但已保存：Tier-1 可用，引导安装扩展解锁 Tier-2
        toast.info(result.warning);
      } else {
        toast.success('账号已保存，含完整 Cookie（含 __zp_stoken__）');
      }
      onSuccess();
    } catch (e) {
      toast.error(errMsg(e, '保存失败'));
    } finally { setConfirming(false); }
  }, [sessionId, label, onSuccess, toast]);

  const statusText: Record<string, string> = {
    pending: '请用 BOSS 直聘 APP 扫描二维码',
    scanned: '已扫码，请在手机上确认',
    stoken: '已登录，正在用浏览器补全 __zp_stoken__…',
    done: '登录成功！输入别名后保存',
    expired: '二维码已过期，请重新获取',
    failed: '登录失败，请重试',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-sm font-semibold text-text-primary">扫码登录 BOSS 直聘</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>
          <p className="text-caption text-text-muted">
            扫码成功即可使用收件箱、推荐候选人、查看/下载简历、打招呼、邀请面试等核心招聘功能。
            搜索功能可能因缺少 <code>__zp_stoken__</code> 返回空结果，但不影响主要招聘流程。
          </p>
          <div className="flex flex-col items-center gap-3 py-2">
            {loading && <Spinner />}
            {!loading && qrImage && status !== 'expired' && status !== 'failed' && (
              <img src={`data:${qrMime};base64,${qrImage}`} alt="二维码" className="h-56 w-56 rounded-lg border border-hairline" />
            )}
            {(status === 'expired' || status === 'failed') && (
              <div className="flex h-56 w-56 flex-col items-center justify-center rounded-lg border border-hairline text-text-muted">
                <span className="mb-2">二维码失效</span>
                <Button size="sm" onClick={startLogin}>重新获取</Button>
              </div>
            )}
            {status && <p className="text-body-sm text-text-secondary text-center">{statusText[status]}</p>}
          </div>
          {status === 'done' && (
            <div className="space-y-2">
              <Input label="账号别名" placeholder="如：主账号" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Button className="w-full" onClick={handleConfirm} disabled={confirming}>
                {confirming ? '保存中…' : '保存账号'}
              </Button>
            </div>
          )}
          {status && status !== 'done' && status !== 'expired' && status !== 'failed' && (
            <Button variant="ghost" size="sm" className="w-full" onClick={startLogin} disabled={loading}>刷新二维码</Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── 补全 Cookie 弹窗（扫码后用扩展补充 __zp_stoken__）──────────────
function SupplementCookieModal({ accountId, accountLabel, onClose, onSuccess }: {
  accountId: number; accountLabel: string; onClose: () => void; onSuccess: () => void;
}) {
  const toast = useToast();
  const [cookies, setCookies] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const raw = cookies.trim();
    if (!raw) { toast.error('请粘贴从浏览器扩展采集的 Cookie'); return; }
    setSaving(true);
    try {
      const r = await api.bossSupplementCookie(accountId, raw);
      if (r.warning) {
        toast.info(r.warning);
      } else {
        toast.success(r.authenticated !== false ? 'Cookie 已补全，登录态正常' : 'Cookie 已合并，但登录态校验未通过');
      }
      onSuccess();
    } catch (e) { toast.error(errMsg(e, '补全失败')); }
    finally { setSaving(false); }
  }, [accountId, cookies, onSuccess, toast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-sm font-semibold text-text-primary">补全 Cookie — {accountLabel}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>
          <div className="rounded-lg bg-warning-50 px-3 py-2 text-caption text-text-secondary">
            该账号缺少 <code>__zp_stoken__</code>，搜索功能可能返回空结果。
            其他功能（收件箱、推荐、查看简历、打招呼、邀请面试）均已可用。
            如需完整搜索能力，可手动从浏览器开发者工具复制包含 stoken 的 Cookie 粘贴到下方补全。
          </div>
          <div className="space-y-2">
            <label className="text-body-sm font-medium text-text-primary">粘贴完整 Cookie</label>
            <textarea
              className="h-28 w-full rounded-lg border border-hairline p-2 font-mono text-caption"
              placeholder="__zp_stoken__=...; wt2=...; wbg=...; zp_at=..."
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
            />
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? '合并中…' : '合并并校验'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Chrome 扩展安装指引弹窗 ──────────────────────────────────────
function ExtensionGuideModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const accounts = await api.bossAccounts();
      const active = accounts.find(a => a.is_active);
      if (active?.has_stoken) {
        toast.success('Cookie 已补全，全功能已解锁！');
        onSuccess();
      } else {
        toast.info('请先在 Chrome 扩展中完成 Cookie 采集，然后点击此按钮刷新状态。');
      }
    } catch {
      toast.error('刷新失败，请稍后重试');
    } finally {
      setSyncing(false);
    }
  }, [onSuccess, toast]);

  const handleDownload = useCallback(() => {
    window.open(api.bossExtensionDownloadUrl(), '_blank');
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-title-sm font-semibold text-text-primary">安装浏览器扩展</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>

          <div className="space-y-3 text-body-sm text-text-secondary">
            <p>Chrome 扩展可一键采集 BOSS 直聘 Cookie（含 <code>__zp_stoken__</code>），解锁完整搜索能力。</p>

            <div className="rounded-lg bg-surface-soft p-3 space-y-2">
              <div className="font-medium text-text-primary">安装步骤：</div>
              <ol className="list-decimal list-inside space-y-1 text-caption">
                <li>点击下方按钮下载扩展 ZIP 包</li>
                <li>解压 ZIP 文件到任意目录</li>
                <li>在 Chrome 地址栏输入 <code>chrome://extensions/</code> 并打开</li>
                <li>右上角开启「开发者模式」</li>
                <li>点击「加载已解压的扩展程序」，选择解压后的目录</li>
                <li>点击工具栏上的扩展图标 → 「一键采集并同步到智聘」</li>
              </ol>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-caption text-blue-700">
              💡 安装扩展后，在 BOSS 直聘页面停留几秒，点击扩展图标即可一键采集 Cookie 并同步到智聘。
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleDownload}>
              <span className="mr-1">📥</span> 下载扩展
            </Button>
            <Button className="flex-1" variant="ghost" onClick={handleSync} disabled={syncing}>
              {syncing ? '检测中…' : '刷新状态'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
