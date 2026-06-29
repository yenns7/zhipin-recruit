// BOSS 直聘集成页 —— 通过 boss-cli 操作招聘端：
// 收件箱闭环、推荐候选人、查看/下载简历、岗位列表。
//
// 扫码登录即全功能可用，无需安装浏览器扩展或采集 __zp_stoken__。
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SegmentedControl,
  Skeleton,
  Spinner,
  TableSkeleton,
} from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type {
  BossCandidate,
  BossJob,
  BossStatus,
} from '../../../types';
import { BossAccountManager } from './BossAccountManager';
import { BossInboxWorkbench } from './BossInboxWorkbench';

type TabKey = 'inbox' | 'recommend' | 'jobs';

// 从 boss-cli 返回结构里抽取候选人列表（字段名随接口，做兼容）。
function extractCandidates(data: unknown): BossCandidate[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const list =
    (d.geekList as BossCandidate[] | undefined) ??
    (d.resultList as BossCandidate[] | undefined) ??
    (d.friendList as BossCandidate[] | undefined) ??
    (d.result as BossCandidate[] | undefined);
  return Array.isArray(list) ? list : [];
}

function candidateName(c: BossCandidate): string {
  return String(c.name ?? c.geekName ?? '—');
}
function candidatePosition(c: BossCandidate): string {
  return String(c.expectPositionName ?? c.jobName ?? '—');
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

// 503 = boss-cli 未安装；401 = BOSS 未登录；409 = 无激活账号。
function classifyError(e: unknown): string | null {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'boss_cli_not_installed';
    if (e.status === 401) return 'not_authenticated';
    if (e.status === 409) return 'no_active_account';
  }
  return null;
}

export function BossPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('inbox');

  // ── 登录态 ─────────────────────────────────────────────
  const [status, setStatus] = useState<BossStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const s = await api.bossStatus();
      setStatus(s);
    } catch (e) {
      const kind = classifyError(e);
      if (kind === 'boss_cli_not_installed') {
        setStatusError('boss_cli_not_installed');
      } else if (kind === 'not_authenticated' || kind === 'no_active_account') {
        setStatus({ authenticated: false, credential_present: false });
      } else {
        setStatusError(errMsg(e, '登录态检测失败'));
      }
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // ── 推荐候选人 ─────────────────────────────────────────
  const [recJob, setRecJob] = useState('');
  const [recResults, setRecResults] = useState<BossCandidate[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recLoaded, setRecLoaded] = useState(false);

  const runRecommend = useCallback(async () => {
    setRecLoading(true);
    setRecError(null);
    setRecLoaded(true);
    try {
      const data = await api.bossRecommendCandidates({ job: recJob || undefined, limit: 20 });
      setRecResults(extractCandidates(data));
    } catch (e) {
      const kind = classifyError(e);
      setRecError(
        kind === 'boss_cli_not_installed' ? 'boss_cli_not_installed'
        : kind === 'not_authenticated' ? 'not_authenticated'
        : errMsg(e, '获取推荐失败'),
      );
      setRecResults([]);
    } finally {
      setRecLoading(false);
    }
  }, [recJob]);

  useEffect(() => {
    if (tab === 'recommend' && !recLoaded) runRecommend();
  }, [tab, recLoaded, runRecommend]);

  // ── 岗位管理（只读） ────────────────────────────────────
  const [jobs, setJobs] = useState<BossJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  const runJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const data = await api.bossJobs();
      setJobs(Array.isArray(data) ? data : []);
      setJobsLoaded(true);
    } catch (e) {
      const kind = classifyError(e);
      setJobsError(
        kind === 'boss_cli_not_installed' ? 'boss_cli_not_installed'
        : kind === 'not_authenticated' ? 'not_authenticated'
        : errMsg(e, '加载岗位失败'),
      );
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'jobs' && !jobsLoaded) runJobs();
  }, [tab, jobsLoaded, runJobs]);

  // ── 简历查看/下载 ──────────────────────────────────────
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeTitle, setResumeTitle] = useState('');

  const viewResume = useCallback(async (c: BossCandidate) => {
    const gid = c.encryptGeekId ?? c.encryptUid ?? c.encryptFriendId ?? '';
    if (!gid) {
      toast.error('该候选人缺少 encryptGeekId，无法查看简历');
      return;
    }
    setResumeTitle(candidateName(c));
    setResumeOpen(true);
    setResumeLoading(true);
    setResumeText('');
    try {
      const data = await api.bossResume(gid);
      setResumeText(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } catch (e) {
      setResumeText('加载失败：' + errMsg(e, '未知错误'));
    } finally {
      setResumeLoading(false);
    }
  }, [toast]);

  const downloadResume = useCallback((c: BossCandidate) => {
    const gid = c.encryptGeekId ?? c.encryptUid ?? c.encryptFriendId ?? '';
    if (!gid) {
      toast.error('该候选人缺少 encryptGeekId，无法下载简历');
      return;
    }
    const url = api.bossResumeDownloadUrl(gid);
    window.open(url, '_blank');
  }, [toast]);

  // ── 渲染 ───────────────────────────────────────────────
  const authenticated = !!status?.authenticated;

  return (
    <div className="space-y-6">
      <PageHeader
        title="BOSS 直聘"
        description="扫码登录即用：收件箱闭环、推荐候选人、查看/下载简历、岗位列表。"
      />

      {/* BOSS 账号管理区：扫码登录 + 多账号切换 */}
      <BossAccountManager onChanged={refreshStatus} />

      {/* 功能区入口（未登录时仍可见，但操作会提示） */}
      {!authenticated && !statusLoading && statusError !== 'boss_cli_not_installed' && (
        <Card>
          <CardBody className="text-body-sm text-text-muted">
            当前 BOSS 账号未登录，请先扫码登录后使用。
          </CardBody>
        </Card>
      )}

      <SegmentedControl<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inbox', label: '收件箱·闭环' },
          { value: 'recommend', label: '推荐候选人' },
          { value: 'jobs', label: '岗位列表' },
        ]}
      />

      {/* 收件箱招聘闭环：拉取→批量导入→AI初筛 */}
      {tab === 'inbox' && <BossInboxWorkbench />}

      {/* 推荐候选人 */}
      {tab === 'recommend' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <Input
                  label="关联岗位 encryptJobId（可选，留空取默认）"
                  placeholder="如 f806096ea327cd610nZ80t21FVNQ"
                  value={recJob}
                  onChange={(e) => setRecJob(e.target.value)}
                />
              </div>
              <Button onClick={runRecommend} disabled={recLoading}>
                {recLoading ? '加载中…' : '刷新推荐'}
              </Button>
            </CardBody>
          </Card>

          {recLoading && <CandidateListSkeleton />}
          {!recLoading && recError && (
            <ErrorState
              message={
                recError === 'boss_cli_not_installed' ? 'boss-cli 未安装，请联系管理员安装 kabi-boss-cli'
                : recError === 'not_authenticated' ? 'BOSS 未登录，请先扫码登录'
                : recError
              }
              onRetry={runRecommend}
            />
          )}
          {!recLoading && !recError && recResults.length === 0 && (
            <EmptyState title="暂无推荐候选人" description="可切换关联岗位或稍后重试。" />
          )}
          {!recLoading && !recError && recResults.length > 0 && (
            <CandidateList
              candidates={recResults}
              onViewResume={viewResume}
              onDownloadResume={downloadResume}
            />
          )}
        </div>
      )}

      {/* 岗位列表（只读） */}
      {tab === 'jobs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={runJobs} disabled={jobsLoading}>刷新</Button>
          </div>
          {jobsLoading && <TableSkeleton />}
          {!jobsLoading && jobsError && (
            <ErrorState
              message={
                jobsError === 'boss_cli_not_installed' ? 'boss-cli 未安装，请联系管理员安装 kabi-boss-cli'
                : jobsError === 'not_authenticated' ? 'BOSS 未登录，请先扫码登录'
                : jobsError
              }
              onRetry={runJobs}
            />
          )}
          {!jobsLoading && !jobsError && jobs.length === 0 && (
            <EmptyState title="暂无在招职位" description="在 BOSS 直聘发布职位后将显示在这里。" />
          )}
          {!jobsLoading && !jobsError && jobs.length > 0 && (
            <Card>
              <CardBody className="overflow-x-auto p-0">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-text-muted">
                      <th className="px-4 py-3 font-medium">职位</th>
                      <th className="px-4 py-3 font-medium">薪资</th>
                      <th className="px-4 py-3 font-medium">地区</th>
                      <th className="px-4 py-3 font-medium">encJobId</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j, i) => (
                      <tr key={j.encryptJobId || i} className="border-b border-hairline last:border-0">
                        <td className="px-4 py-3 font-medium text-text-primary">{j.jobName ?? '—'}</td>
                        <td className="px-4 py-3 text-text-secondary">{j.salaryDesc ?? '—'}</td>
                        <td className="px-4 py-3 text-text-secondary">{j.address ?? '—'}</td>
                        <td className="px-4 py-3 text-caption text-text-muted">{j.encryptJobId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </div>
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

// ── 子组件 ───────────────────────────────────────────────
function CandidateListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardBody>
            <Skeleton className="h-16 w-full" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function CandidateList({
  candidates,
  onViewResume,
  onDownloadResume,
}: {
  candidates: BossCandidate[];
  onViewResume: (c: BossCandidate) => void;
  onDownloadResume: (c: BossCandidate) => void;
}) {
  return (
    <div className="space-y-3">
      {candidates.map((c, i) => {
        const gid = c.encryptGeekId ?? c.encryptUid ?? c.encryptFriendId ?? '';
        return (
          <Card key={gid || i}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{candidateName(c)}</span>
                  {c.newGeek && <Badge tone="info">NEW</Badge>}
                </div>
                <div className="mt-0.5 text-body-sm text-text-secondary">
                  {candidatePosition(c)}
                  {c.workYearDesc ? ` · ${c.workYearDesc}` : ''}
                  {c.degreeDesc ? ` · ${c.degreeDesc}` : ''}
                  {c.salaryDesc ? ` · 期望 ${c.salaryDesc}` : ''}
                </div>
                {gid && <div className="mt-0.5 text-caption text-text-muted">{gid}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onViewResume(c)}>查看简历</Button>
                <Button variant="ghost" size="sm" onClick={() => onDownloadResume(c)}>下载简历</Button>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
