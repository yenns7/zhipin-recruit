// BOSS 账号管理区：扫码登录 + 多账号切换/校验/删除。
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
          <Button size="sm" onClick={() => setQrOpen(true)}>+ 扫码登录添加账号</Button>
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
                  <Button variant="ghost" size="sm" onClick={() => handleVerify(a.id)}>校验</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(a.id)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {qrOpen && (
          <QrLoginModal
            onClose={() => setQrOpen(false)}
            onSuccess={async () => { setQrOpen(false); await refresh(); onChanged?.(); }}
          />
        )}
      </CardBody>
    </Card>
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
      } catch (_e) { /* 静默 */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, toast]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      await api.bossQrLoginConfirm(sessionId, label.trim() || `账号${new Date().toLocaleDateString()}`);
      toast.success('账号已保存');
      onSuccess();
    } catch (e) { toast.error(errMsg(e, '保存失败')); }
    finally { setConfirming(false); }
  }, [sessionId, label, onSuccess, toast]);

  const statusText: Record<string, string> = {
    pending: '请用 BOSS 直聘 APP 扫描二维码',
    scanned: '已扫码，请在手机上确认',
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
