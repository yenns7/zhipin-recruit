// BOSS 直聘集成页 —— 通过 boss-cli 操作招聘端：
// 收件箱闭环、推荐候选人、查看/下载简历、岗位列表。
//
// 扫码登录即全功能可用，无需安装浏览器扩展或采集 __zp_stoken__。
import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
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

// 错误边界组件，防止白屏
interface ErrorBoundaryProps { children: ReactNode }
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class BossPageErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-6">
          <PageHeader title="BOSS 直聘" description="加载出错，请刷新页面重试。" />
          <Card>
            <CardBody className="space-y-4">
              <div className="text-body-sm text-red-600">
                ⚠️ 页面加载出错：{this.state.error?.message || '未知错误'}
              </div>
              <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
                刷新页面
              </Button>
            </CardBody>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      // 后端返回格式化 Markdown 文本
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
    const name = candidateName(c);
    const url = api.bossResumeDownloadUrl(gid);
    // 创建隐藏 a 标签触发下载，指定文件名
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_resume.md`;
    a.click();
    toast.success(`${name} 简历下载中…`);
  }, [toast]);

  // ── 渲染 ───────────────────────────────────────────────
  // 只要 credential_present 为 true 就认为已登录（不需要检查 authenticated，因为搜索功能需要 __zp_stoken__）
  const authenticated = !!status?.credential_present;

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
                  <ResumeContent markdown={resumeText} />
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

// 简历内容渲染器：把 Markdown 转为结构化 HTML
function ResumeContent({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    if (!markdown) return '';
    const lines = markdown.split('\n');
    const parts: string[] = [];
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // 空行
      if (!trimmed) {
        if (inList) { parts.push('</ul>'); inList = false; }
        continue;
      }

      // H1: 姓名
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        if (inList) { parts.push('</ul>'); inList = false; }
        parts.push(`<h1 class="text-xl font-bold text-text-primary mb-1">${esc(trimmed.slice(2))}</h1>`);
        continue;
      }

      // H2: 章节标题
      if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
        if (inList) { parts.push('</ul>'); inList = false; }
        parts.push(`<h2 class="text-title-sm font-semibold text-text-primary mt-4 mb-2 border-b border-hairline pb-1">${esc(trimmed.slice(3))}</h2>`);
        continue;
      }

      // H3: 公司/学校/项目
      if (trimmed.startsWith('### ')) {
        if (inList) { parts.push('</ul>'); inList = false; }
        parts.push(`<h3 class="text-body-sm font-semibold text-text-primary mt-3">${esc(trimmed.slice(4))}</h3>`);
        continue;
      }

      // **bold:** value
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*(.*)$/);
      if (boldMatch) {
        if (inList) { parts.push('</ul>'); inList = false; }
        const value = boldMatch[2].replace(/^\s*-\s*/, '').trim();
        parts.push(`<p class="text-body-sm text-text-secondary mt-1"><span class="font-semibold text-text-primary">${esc(boldMatch[1])}</span>${value ? ': ' + esc(value) : ''}</p>`);
        continue;
      }

      // 列表项
      if (trimmed.startsWith('- ')) {
        if (!inList) { parts.push('<ul class="list-disc list-inside text-body-sm text-text-secondary space-y-0.5 mt-1">'); inList = true; }
        parts.push(`<li>${esc(trimmed.slice(2))}</li>`);
        continue;
      }

      // 普通文本
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<p class="text-body-sm text-text-secondary mt-1">${esc(trimmed)}</p>`);
    }
    if (inList) parts.push('</ul>');
    return parts.join('');
  }, [markdown]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 带错误边界的导出组件
export function BossPageWithBoundary() {
  return (
    <BossPageErrorBoundary>
      <BossPage />
    </BossPageErrorBoundary>
  );
}
