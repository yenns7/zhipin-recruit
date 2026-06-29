// BOSS CLI 功能界面 —— 候选人管理 + 筛选 + 批量下载
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
} from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type { BossCandidate, BossJob } from '../../../types';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

// 从 boss-cli 返回结构里抽取候选人列表
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

// 收件箱标签选项
const LABEL_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 1, label: '新招呼' },
  { value: 2, label: '沟通中' },
  { value: 3, label: '已约面' },
  { value: 4, label: '已获取简历' },
];

export function BossCliTestPage() {
  const toast = useToast();

  // ── 岗位列表 ─────────────────────────────────────────────
  const [jobs, setJobs] = useState<BossJob[]>([]);
  const [selectedJob, setSelectedJob] = useState('');

  const loadJobs = useCallback(async () => {
    try {
      const data = await api.bossJobs();
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(errMsg(e, '加载岗位失败'));
    }
  }, [toast]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // ── 候选人列表（收件箱/推荐）─────────────────────────────
  const [tab, setTab] = useState<'inbox' | 'recommend'>('inbox');
  const [label, setLabel] = useState(0);
  const [limit, setLimit] = useState(20);
  const [candidates, setCandidates] = useState<BossCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidatesError(null);
    setLoaded(true);
    try {
      let data: unknown;
      if (tab === 'inbox') {
        data = await api.bossInbox({ label, limit, job: selectedJob || undefined });
      } else {
        data = await api.bossRecommendCandidates({ limit, job: selectedJob || undefined });
      }
      setCandidates(extractCandidates(data));
    } catch (e) {
      setCandidatesError(errMsg(e, '加载候选人失败'));
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, [tab, label, limit, selectedJob]);

  // ── 选择 / 批量操作 ─────────────────────────────────────
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);

  const toggle = (gid: string) => setSelected((s) => ({ ...s, [gid]: !s[gid] }));
  const toggleAll = () => {
    const allOn = candidates.every((c) => selected[geekIdOf(c)]);
    const next: Record<string, boolean> = {};
    if (!allOn) candidates.forEach((c) => { const g = geekIdOf(c); if (g) next[g] = true; });
    setSelected(next);
  };
  const selectedCandidates = candidates.filter((c) => selected[geekIdOf(c)] && geekIdOf(c));

  // ── 批量下载简历 ─────────────────────────────────────────
  const batchDownload = useCallback(async () => {
    if (selectedCandidates.length === 0) {
      toast.error('请先勾选要下载简历的候选人');
      return;
    }
    setDownloading(true);
    let successCount = 0;
    let failCount = 0;

    for (const c of selectedCandidates) {
      const gid = geekIdOf(c);
      if (!gid) continue;
      try {
        const url = api.bossResumeDownloadUrl(gid, selectedJob ? { job: selectedJob } : undefined);
        window.open(url, '_blank');
        successCount++;
        // 间隔 500ms 避免浏览器阻止弹窗
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        failCount++;
      }
    }

    setDownloading(false);
    toast.success(`批量下载完成：成功 ${successCount}，失败 ${failCount}`);
  }, [selectedCandidates, selectedJob, toast]);

  // ── 查看简历 ─────────────────────────────────────────────
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeTitle, setResumeTitle] = useState('');

  const viewResume = useCallback(async (c: BossCandidate) => {
    const gid = geekIdOf(c);
    if (!gid) {
      toast.error('该候选人缺少 encryptGeekId');
      return;
    }
    setResumeTitle(nameOf(c));
    setResumeOpen(true);
    setResumeLoading(true);
    setResumeText('');
    try {
      const data = await api.bossResume(gid, selectedJob ? { job: selectedJob } : undefined);
      setResumeText(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } catch (e) {
      setResumeText('加载失败：' + errMsg(e, '未知错误'));
    } finally {
      setResumeLoading(false);
    }
  }, [selectedJob, toast]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="BOSS 直聘候选人管理"
        description="筛选岗位、查看候选人、批量下载简历。"
      />

      {/* 筛选区 */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Select
                label="筛选岗位（可选）"
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
              >
                <option value="">全部岗位</option>
                {jobs.map((j) => (
                  <option key={j.encryptJobId} value={j.encryptJobId}>
                    {j.jobName}（{j.address || '不限'}）
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[150px]">
              <Select label="候选人标签" value={String(label)} onChange={(e) => setLabel(Number(e.target.value))}>
                {LABEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="min-w-[100px]">
              <Select label="数量" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
                {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-hairline overflow-hidden">
              <button
                className={`px-4 py-2 text-body-sm ${tab === 'inbox' ? 'bg-blue-500 text-white' : 'bg-white text-text-primary hover:bg-gray-50'}`}
                onClick={() => setTab('inbox')}
              >
                收件箱
              </button>
              <button
                className={`px-4 py-2 text-body-sm ${tab === 'recommend' ? 'bg-blue-500 text-white' : 'bg-white text-text-primary hover:bg-gray-50'}`}
                onClick={() => setTab('recommend')}
              >
                推荐候选人
              </button>
            </div>
            <Button onClick={loadCandidates} disabled={candidatesLoading}>
              {candidatesLoading ? '加载中…' : '加载候选人'}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-body-sm text-text-muted">
                已选 {selectedCandidates.length} / {candidates.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={batchDownload}
                disabled={downloading || selectedCandidates.length === 0}
              >
                {downloading ? '下载中…' : `批量下载简历(${selectedCandidates.length})`}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 候选人列表 */}
      {candidatesLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardBody><Skeleton className="h-16 w-full" /></CardBody></Card>
          ))}
        </div>
      )}
      {!candidatesLoading && candidatesError && (
        <ErrorState message={candidatesError} onRetry={loadCandidates} />
      )}
      {!candidatesLoading && !candidatesError && loaded && candidates.length === 0 && (
        <EmptyState title="暂无候选人" description="可切换筛选条件或标签后重试。" />
      )}
      {!candidatesLoading && !candidatesError && candidates.length > 0 && (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-text-muted">
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={candidates.every((c) => selected[geekIdOf(c)])}
                        onChange={toggleAll}
                        aria-label="全选"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">候选人</th>
                    <th className="px-3 py-2 font-medium">期望/经验</th>
                    <th className="px-3 py-2 font-medium">geekId</th>
                    <th className="px-3 py-2 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => {
                    const gid = geekIdOf(c);
                    return (
                      <tr key={gid || i} className="border-b border-hairline last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected[gid]}
                            onChange={() => toggle(gid)}
                            disabled={!gid}
                            aria-label={`选择 ${nameOf(c)}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">{nameOf(c)}</span>
                            {c.newGeek && <Badge tone="info">NEW</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {String(c.expectPositionName ?? c.jobName ?? '—')}
                          {c.workYearDesc ? ` · ${c.workYearDesc}` : ''}
                          {c.salaryDesc ? ` · ${c.salaryDesc}` : ''}
                        </td>
                        <td className="px-3 py-2 text-caption text-text-muted font-mono">{gid || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => viewResume(c)}>查看简历</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const url = api.bossResumeDownloadUrl(gid, selectedJob ? { job: selectedJob } : undefined);
                                window.open(url, '_blank');
                              }}
                            >
                              下载
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 简历查看弹窗 */}
      {resumeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="flex max-h-[80vh] w-full max-w-2xl flex-col">
            <CardBody className="flex flex-col gap-3 overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                <h3 className="text-title-sm font-semibold text-text-primary">{resumeTitle} · 简历</h3>
                <Button variant="ghost" size="sm" onClick={() => setResumeOpen(false)}>关闭</Button>
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {resumeLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-body-sm text-text-secondary">{resumeText}</pre>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
