// BOSS 直聘集成页 —— 通过 boss-cli（kabi-boss-cli）操作招聘端：
// 登录态检测、搜索/推荐候选人、查看/下载简历、岗位上下线、沟通动作。
//
// 后端 /api/boss/* 蓝图封装 boss 命令；CLI 未安装时接口返回 503，本页据此引导。
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  TableSkeleton,
} from '../../../components/ui';
import { useToast } from '../../../components/ui/ToastContext';
import { api, ApiError } from '../../../lib/api';
import type {
  BossAccount,
  BossCandidate,
  BossJob,
  BossStatus,
} from '../../../types';
import { BossAccountManager } from './BossAccountManager';
import { BossInboxWorkbench } from './BossInboxWorkbench';

type TabKey = 'inbox' | 'search' | 'recommend' | 'jobs';

const CITY_OPTIONS = [
  '全国', '北京', '上海', '杭州', '深圳', '广州', '成都', '南京',
  '苏州', '武汉', '西安', '厦门', '长沙', '重庆', '天津',
];
const EXP_OPTIONS = ['', '不限', '在校/应届', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'];
const DEGREE_OPTIONS = ['', '不限', '大专', '本科', '硕士', '博士'];
const SALARY_OPTIONS = ['', '3K以下', '3-5K', '5-10K', '10-15K', '15-20K', '20-30K', '30-50K', '50K以上'];

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

// 503 = boss-cli 未安装；401 = BOSS 未登录；409 = 无激活账号或需 stoken。
function classifyError(e: unknown): string | null {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'boss_cli_not_installed';
    if (e.status === 401) return 'not_authenticated';
    if (e.status === 409) {
      return e.message.includes('账号') ? 'no_active_account' : 'needs_stoken';
    }
  }
  return null;
}

export function BossPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('search');

  // ── 登录态 ─────────────────────────────────────────────
  const [status, setStatus] = useState<BossStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // ── stoken 状态（功能分层：Tier-2 需要 stoken）────────────
  const [hasStoken, setHasStoken] = useState(true); // 默认 true，避免闪烁

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const [s, accounts] = await Promise.all([
        api.bossStatus(),
        api.bossAccounts().catch(() => [] as BossAccount[]),
      ]);
      setStatus(s);
      // 从激活账号获取 stoken 状态
      const active = accounts.find((a) => a.is_active);
      setHasStoken(active?.has_stoken ?? false);
    } catch (e) {
      const kind = classifyError(e);
      if (kind === 'boss_cli_not_installed') {
        setStatusError('boss_cli_not_installed');
      } else if (kind === 'not_authenticated' || kind === 'no_active_account') {
        setStatus({ authenticated: false, credential_present: false });
        setHasStoken(false);
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

  // ── 搜索候选人 ─────────────────────────────────────────
  const [keyword, setKeyword] = useState('golang');
  const [city, setCity] = useState('上海');
  const [exp, setExp] = useState('');
  const [degree, setDegree] = useState('');
  const [salary, setSalary] = useState('');
  const [page, setPage] = useState(1);
  const [searchResults, setSearchResults] = useState<BossCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (p: number) => {
    if (!keyword.trim()) {
      toast.error('请输入搜索关键词');
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSearched(true);
    try {
      const data = await api.bossSearchCandidates({
        keyword: keyword.trim(), city, exp, degree, salary, page: p,
      });
      setSearchResults(extractCandidates(data));
      setPage(p);
    } catch (e) {
      const kind = classifyError(e);
      setSearchError(
        kind === 'boss_cli_not_installed' ? 'boss_cli_not_installed'
        : kind === 'not_authenticated' ? 'not_authenticated'
        : errMsg(e, '搜索失败'),
      );
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [keyword, city, exp, degree, salary, toast]);

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

  // ── 岗位管理 ───────────────────────────────────────────
  const [jobs, setJobs] = useState<BossJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [confirmJob, setConfirmJob] = useState<{ id: string; action: 'close' | 'reopen'; name: string } | null>(null);
  const [jobActionLoading, setJobActionLoading] = useState(false);

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

  const doJobAction = useCallback(async () => {
    if (!confirmJob) return;
    setJobActionLoading(true);
    try {
      if (confirmJob.action === 'close') await api.bossJobClose(confirmJob.id);
      else await api.bossJobReopen(confirmJob.id);
      toast.success(confirmJob.action === 'close' ? '岗位已下线' : '岗位已重新上线');
      setConfirmJob(null);
      runJobs();
    } catch (e) {
      toast.error(errMsg(e, '操作失败'));
    } finally {
      setJobActionLoading(false);
    }
  }, [confirmJob, toast, runJobs]);

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
      // boss recruiter resume 返回结构化 JSON；展示为格式化文本
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

  // ── 沟通动作 ───────────────────────────────────────────
  // 打招呼需要 encrypt_job_id（关联职位）；从已加载的岗位列表自动选取
  const greetJobId = jobs.length === 1 ? (jobs[0].encryptJobId ?? '') : '';

  const greet = useCallback(async (c: BossCandidate) => {
    const gid = c.encryptGeekId ?? c.encryptUid ?? '';
    if (!gid) {
      toast.error('该候选人缺少 encryptGeekId');
      return;
    }
    try {
      await api.bossGreet(gid, { job: greetJobId || undefined });
      toast.success(`已向 ${candidateName(c)} 发起沟通`);
    } catch (e) {
      toast.error(errMsg(e, '打招呼失败'));
    }
  }, [toast, greetJobId]);

  const requestResume = useCallback(async (c: BossCandidate) => {
    const fid = c.friendId;
    if (!fid) {
      toast.error('该候选人缺少 friendId，无法请求简历');
      return;
    }
    const gid = c.encryptGeekId ?? c.encryptUid ?? '';
    try {
      await api.bossRequestResume(gid ?? String(fid), fid);
      toast.success(`已向 ${candidateName(c)} 请求简历`);
    } catch (e) {
      toast.error(errMsg(e, '请求简历失败'));
    }
  }, [toast]);

  // ── 渲染 ───────────────────────────────────────────────
  const authenticated = !!status?.authenticated;

  return (
    <div className="space-y-6">
      <PageHeader
        title="BOSS 直聘"
        description="扫码登录即用：收件箱闭环、推荐候选人、查看/下载简历、打招呼、邀请面试、岗位管理。"
      />

      {/* BOSS 账号管理区：扫码登录 + 多账号切换 */}
      <BossAccountManager onChanged={refreshStatus} />

      {/* 功能区入口（未登录时仍可见，但操作会提示） */}
      {!authenticated && !statusLoading && statusError !== 'boss_cli_not_installed' && (
        <Card>
          <CardBody className="text-body-sm text-text-muted">
            当前 BOSS 账号未登录，下列功能将无法使用。请先「去登录」并刷新登录态。
          </CardBody>
        </Card>
      )}

      <SegmentedControl<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inbox', label: '收件箱·闭环' },
          { value: 'search', label: '搜候选人' },
          { value: 'recommend', label: '推荐候选人' },
          { value: 'jobs', label: '岗位管理' },
        ]}
      />

      {/* stoken 缺失提示：扫码登录已覆盖大部分能力，搜索可能受限 */}
      {authenticated && !hasStoken && (
        <Card className="border-amber-200 bg-amber-50">
          <CardBody className="flex flex-row items-center gap-3 text-body-sm text-amber-700">
            <span className="text-lg">ℹ️</span>
            <div>
              <span className="font-medium">Cookie 不完整，搜索功能可能受限。</span>
              {' '}当前缺少 <code>__zp_stoken__</code>，搜索候选人可能返回空结果。
              推荐候选人、收件箱、查看/下载简历、打招呼、邀请面试等功能均已可用。
              安装浏览器扩展并点击「安装扩展」按钮可一键补全 Cookie，解锁完整搜索能力。
            </div>
          </CardBody>
        </Card>
      )}

      {/* 多岗位时打招呼提示：需先在岗位管理确认唯一岗位 */}
      {authenticated && jobs.length > 1 && (tab === 'search' || tab === 'recommend') && (
        <div className="text-caption text-text-muted px-1">
          💡 当前有 {jobs.length} 个在招岗位，打招呼将自动关联第一个岗位。如需指定岗位，请在「岗位管理」中只保留一个在招岗位。
        </div>
      )}

      {/* 收件箱招聘闭环：拉取→批量导入→AI初筛→面试邀请（人工确认） */}
      {tab === 'inbox' && <BossInboxWorkbench />}

      {/* 搜候选人 */}
      {tab === 'search' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label="关键词"
                    placeholder="如 golang / 前端 / 产品经理"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(1); }}
                  />
                </div>
                <Select label="城市" value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
                <Select label="经验" value={exp} onChange={(e) => setExp(e.target.value)}>
                  {EXP_OPTIONS.map((o, i) => <option key={i} value={o}>{o || '不限'}</option>)}
                </Select>
                <Select label="学历" value={degree} onChange={(e) => setDegree(e.target.value)}>
                  {DEGREE_OPTIONS.map((o, i) => <option key={i} value={o}>{o || '不限'}</option>)}
                </Select>
                <Select label="薪资" value={salary} onChange={(e) => setSalary(e.target.value)}>
                  {SALARY_OPTIONS.map((o, i) => <option key={i} value={o}>{o || '不限'}</option>)}
                </Select>
                <Button onClick={() => runSearch(1)} disabled={searchLoading}>
                  {searchLoading ? '搜索中…' : '搜索'}
                </Button>
              </div>
            </CardBody>
          </Card>

          {searchLoading && <CandidateListSkeleton />}
          {!searchLoading && searchError && (
            <ErrorState
              message={
                searchError === 'boss_cli_not_installed' ? 'boss-cli 未安装，请联系管理员安装 kabi-boss-cli'
                : searchError === 'not_authenticated' ? 'BOSS 未登录，请先在「去登录」完成登录'
                : searchError
              }
              onRetry={() => runSearch(1)}
            />
          )}
          {!searchLoading && !searchError && searched && searchResults.length === 0 && (
            <EmptyState
              title="未找到匹配候选人"
              description={
                !hasStoken
                  ? '搜索可能因缺少 __zp_stoken__ 返回空结果。可尝试更换关键词，或在「账号管理」中补全 Cookie 以解锁完整搜索能力。'
                  : '可调整关键词/城市/筛选条件后重试。'
              }
            />
          )}
          {!searchLoading && !searchError && searchResults.length > 0 && (
            <CandidateList
              candidates={searchResults}
              onViewResume={viewResume}
              onDownloadResume={downloadResume}
              onGreet={greet}
              onRequestResume={requestResume}
            />
          )}
        </div>
      )}

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
                : recError === 'not_authenticated' ? 'BOSS 未登录，请先在「去登录」完成登录'
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
              onGreet={greet}
              onRequestResume={requestResume}
            />
          )}
        </div>
      )}

      {/* 岗位管理 */}
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
                : jobsError === 'not_authenticated' ? 'BOSS 未登录，请先在「去登录」完成登录'
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
                      <th className="px-4 py-3 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j, i) => {
                      const jid = j.encryptJobId ?? '';
                      return (
                        <tr key={jid || i} className="border-b border-hairline last:border-0">
                          <td className="px-4 py-3 font-medium text-text-primary">{j.jobName ?? '—'}</td>
                          <td className="px-4 py-3 text-text-secondary">{j.salaryDesc ?? '—'}</td>
                          <td className="px-4 py-3 text-text-secondary">{j.address ?? '—'}</td>
                          <td className="px-4 py-3 text-caption text-text-muted">{jid || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmJob({ id: jid, action: 'close', name: j.jobName ?? jid })}
                            >
                              下线
                            </Button>{' '}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmJob({ id: jid, action: 'reopen', name: j.jobName ?? jid })}
                            >
                              重新上线
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* 岗位操作确认 */}
      <ConfirmDialog
        open={!!confirmJob}
        title={confirmJob?.action === 'close' ? '下线岗位' : '重新上线岗位'}
        description={
          confirmJob
            ? `确认${confirmJob.action === 'close' ? '下线' : '重新上线'}岗位「${confirmJob.name}」？`
            : undefined
        }
        onCancel={() => setConfirmJob(null)}
        onConfirm={doJobAction}
      />
      {confirmJob && jobActionLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Spinner />
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

      {/* 分页（搜索结果）—— boss-cli 单页返回，这里保留翻页入口 */}
      {tab === 'search' && !searchLoading && !searchError && searchResults.length > 0 && (
        <Pagination page={page} totalPages={Math.max(page + 1, 1)} onChange={(p) => runSearch(p)} />
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
  onGreet,
  onRequestResume,
}: {
  candidates: BossCandidate[];
  onViewResume: (c: BossCandidate) => void;
  onDownloadResume: (c: BossCandidate) => void;
  onGreet: (c: BossCandidate) => void;
  onRequestResume: (c: BossCandidate) => void;
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
                <Button variant="ghost" size="sm" onClick={() => onGreet(c)}>打招呼</Button>
                {c.friendId != null && (
                  <Button variant="ghost" size="sm" onClick={() => onRequestResume(c)}>请求简历</Button>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
