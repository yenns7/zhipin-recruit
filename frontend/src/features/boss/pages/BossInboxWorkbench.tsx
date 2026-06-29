// BOSS 招聘闭环工作台 —— 收件箱拉取 → 勾选批量导入 → AI 简历初筛。
//
// 扫码登录即全功能可用，无需 stoken 或浏览器扩展。
// 导入后的候选人可在系统「候选人管理」中安排面试（POST /interview/assignments），
// 不再向 BOSS 直聘发面试邀请（该动作依赖短效 __zp_stoken__，已移除）。
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Select,
  Spinner,
} from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type {
  BossCandidate,
  BossScreenResultItem,
  JobListItem,
} from '../../../types';

// 收件箱标签：0 全部 / 1 新招呼 / 2 沟通中
const LABEL_OPTIONS = [
  { value: 2, label: '沟通中' },
  { value: 1, label: '新招呼' },
  { value: 0, label: '全部' },
];

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

function extractCandidates(data: unknown): BossCandidate[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const list =
    (d.friendList as BossCandidate[] | undefined) ??
    (d.geekList as BossCandidate[] | undefined) ??
    (d.resultList as BossCandidate[] | undefined) ??
    (d.result as BossCandidate[] | undefined);
  return Array.isArray(list) ? list : [];
}

function geekIdOf(c: BossCandidate): string {
  return String(c.encryptGeekId ?? c.encryptUid ?? c.encryptFriendId ?? '');
}
function nameOf(c: BossCandidate): string {
  return String(c.name ?? c.geekName ?? '—');
}

// 导入后产生的候选人（用于 AI 初筛阶段）
interface ImportedRow {
  candidateId: number;
  name: string;
  geekId: string;
  bossJob?: string;
  screen?: BossScreenResultItem;
}

export function BossInboxWorkbench() {
  const toast = useToast();

  // ── 系统岗位（导入归属 / AI 初筛 JD 来源）───────────────────
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [targetJobId, setTargetJobId] = useState<number | ''>('');
  // BOSS encryptJobId：收件箱过滤 + 简历下载 --job
  const [bossJob, setBossJob] = useState('');

  useEffect(() => {
    api.listJobs('active').then(setJobs).catch(() => setJobs([]));
  }, []);

  // ── 收件箱 ─────────────────────────────────────────────
  const [label, setLabel] = useState(2);
  const [limit, setLimit] = useState(20);
  const [inbox, setInbox] = useState<BossCandidate[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    setInboxError(null);
    setLoaded(true);
    try {
      const data = await api.bossInbox({ label, limit, job: bossJob || undefined });
      const list = extractCandidates(data);
      setInbox(list);
      setSelected({});
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setInboxError('boss-cli 未安装，请联系管理员安装招聘端版本');
      else if (e instanceof ApiError && e.status === 401) setInboxError('BOSS 未登录，请先扫码登录账号');
      else if (e instanceof ApiError && e.status === 409) setInboxError(e.message);
      else setInboxError(errMsg(e, '加载收件箱失败'));
      setInbox([]);
    } finally {
      setInboxLoading(false);
    }
  }, [label, limit, bossJob]);

  const toggle = (gid: string) => setSelected((s) => ({ ...s, [gid]: !s[gid] }));
  const toggleAll = () => {
    const allOn = inbox.every((c) => selected[geekIdOf(c)]);
    const next: Record<string, boolean> = {};
    if (!allOn) inbox.forEach((c) => { const g = geekIdOf(c); if (g) next[g] = true; });
    setSelected(next);
  };
  const selectedCandidates = inbox.filter((c) => selected[geekIdOf(c)] && geekIdOf(c));

  // ── 批量导入 ───────────────────────────────────────────
  const [imported, setImported] = useState<ImportedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const runImport = useCallback(async (cands: BossCandidate[]) => {
    if (cands.length === 0) {
      toast.error('请先勾选要导入的候选人');
      return;
    }
    setImporting(true);
    try {
      const res = await api.bossBatchImport({
        items: cands.map((c) => ({
          geek_id: geekIdOf(c),
          name: nameOf(c),
          security_id: c.securityId ? String(c.securityId) : undefined,
          friend_id: c.friendId,
          job: bossJob || undefined,
        })),
        target_job_id: targetJobId === '' ? undefined : Number(targetJobId),
        boss_job: bossJob || undefined,
        limit: 50,
        interval_sec: 1.5,
      });
      const ok = res.results.filter((r) => r.status === 'ok');
      setImported((prev) => {
        const seen = new Set(prev.map((p) => p.candidateId));
        const add: ImportedRow[] = ok
          .filter((r) => r.candidate_id && !seen.has(r.candidate_id))
          .map((r) => ({
            candidateId: r.candidate_id!,
            name: r.name ?? '—',
            geekId: r.geek_id,
            bossJob: bossJob || undefined,
          }));
        return [...prev, ...add];
      });
      let msg = `导入完成：成功 ${res.imported}，跳过 ${res.skipped}，失败 ${res.failed}`;
      if (res.stopped_reason === 'rate_limited') msg += '（触发 BOSS 频控，已自动停止，请稍后再试剩余项）';
      toast.success(msg);
    } catch (e) {
      toast.error(errMsg(e, '批量导入失败'));
    } finally {
      setImporting(false);
    }
  }, [bossJob, targetJobId, toast]);

  // ── AI 初筛 ────────────────────────────────────────────
  const [screening, setScreening] = useState(false);
  const runScreen = useCallback(async (rows: ImportedRow[]) => {
    if (targetJobId === '') {
      toast.error('请先选择用于 AI 初筛的系统岗位（提供 JD）');
      return;
    }
    if (rows.length === 0) {
      toast.error('暂无可初筛的候选人，请先导入');
      return;
    }
    setScreening(true);
    try {
      const res = await api.bossAiScreen({
        candidate_ids: rows.map((r) => r.candidateId),
        job_id: Number(targetJobId),
      });
      setImported((prev) => prev.map((p) => {
        const hit = res.results.find((r) => r.candidate_id === p.candidateId && r.status === 'ok');
        return hit ? { ...p, screen: hit } : p;
      }));
      toast.success(`AI 初筛完成：成功 ${res.screened}，失败 ${res.failed}`);
    } catch (e) {
      toast.error(errMsg(e, 'AI 初筛失败'));
    } finally {
      setScreening(false);
    }
  }, [targetJobId, toast]);

  return (
    <div className="space-y-4">
      {/* 配置区：系统岗位 + BOSS 关联职位 */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Select
              label="系统岗位（导入归属 / AI 初筛 JD）"
              value={targetJobId === '' ? '' : String(targetJobId)}
              onChange={(e) => setTargetJobId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">请选择岗位</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}（{j.city || '不限'}）</option>)}
            </Select>
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="text-body-sm font-medium text-text-primary block mb-1.5">BOSS 关联职位 encryptJobId（收件箱过滤）</label>
            <input
              className="w-full rounded-lg border border-hairline px-3 py-2 text-body-sm"
              placeholder="如 f806096ea327cd610nZ80t21FVNQ（可留空）"
              value={bossJob}
              onChange={(e) => setBossJob(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {/* 步骤一：收件箱拉取 + 勾选导入 */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Select label="范围" value={String(label)} onChange={(e) => setLabel(Number(e.target.value))}>
              {LABEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Select label="数量" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Button onClick={loadInbox} disabled={inboxLoading}>
              {inboxLoading ? '加载中…' : '拉取收件箱'}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => runImport(selectedCandidates)}
                disabled={importing || selectedCandidates.length === 0}
              >
                {importing ? '导入中…' : `批量导入勾选(${selectedCandidates.length})`}
              </Button>
            </div>
          </div>

          {inboxLoading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!inboxLoading && inboxError && <ErrorState message={inboxError} onRetry={loadInbox} />}
          {!inboxLoading && !inboxError && loaded && inbox.length === 0 && (
            <EmptyState title="收件箱为空" description="可切换范围/数量或先在 BOSS 直聘与候选人沟通。" />
          )}
          {!inboxLoading && !inboxError && inbox.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-text-muted">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={inbox.every((c) => selected[geekIdOf(c)])}
                        onChange={toggleAll}
                        aria-label="全选"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">候选人</th>
                    <th className="px-3 py-2 font-medium">期望/经验</th>
                    <th className="px-3 py-2 font-medium">geekId</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((c, i) => {
                    const gid = geekIdOf(c);
                    return (
                      <tr key={gid || i} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected[gid]}
                            onChange={() => toggle(gid)}
                            disabled={!gid}
                            aria-label={`选择 ${nameOf(c)}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-text-primary">
                          {nameOf(c)} {c.newGeek && <Badge tone="info">NEW</Badge>}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {String(c.expectPositionName ?? c.jobName ?? '—')}
                          {c.workYearDesc ? ` · ${c.workYearDesc}` : ''}
                        </td>
                        <td className="px-3 py-2 text-caption text-text-muted">{gid || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 步骤二：已导入候选人 → AI 初筛 */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm font-semibold text-text-primary">
              已导入候选人（{imported.length}）
            </h3>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => runScreen(imported.filter((r) => !r.screen))}
                disabled={screening || imported.length === 0}
              >
                {screening ? 'AI 初筛中…' : 'AI 初筛未筛项'}
              </Button>
            </div>
          </div>

          {imported.length === 0 ? (
            <EmptyState title="还没有导入候选人" description="在上方勾选收件箱候选人并「批量导入」后将出现在这里。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-text-muted">
                    <th className="px-3 py-2 font-medium">候选人</th>
                    <th className="px-3 py-2 font-medium">AI 初筛</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {imported.map((r) => (
                    <tr key={r.candidateId} className="border-b border-hairline last:border-0 align-top">
                      <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                      <td className="px-3 py-2">
                        {r.screen ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Badge tone={r.screen.pass_recommended ? 'success' : 'warning'}>
                                {r.screen.score ?? '—'} 分
                              </Badge>
                              <span className="text-text-secondary">
                                {r.screen.pass_recommended ? '建议进入面试' : '建议谨慎'}
                              </span>
                            </div>
                            {r.screen.summary && (
                              <div className="text-caption text-text-muted">{r.screen.summary}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">未初筛</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => runScreen([r])}
                          disabled={screening}
                        >
                          {r.screen ? '重筛' : 'AI 初筛'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {imported.length > 0 && (
            <div className="rounded-lg bg-surface-soft px-4 py-3 text-body-sm text-text-secondary">
              💡 导入后如需安排面试，请前往「候选人管理」页面创建面试安排，或联系管理员配置面试流程。
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
