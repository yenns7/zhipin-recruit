// ─────────────────────────────────────────────────────────────────────────────
// Task 2: 前端 SmokeRoutes.test.tsx
// 15 个冒烟测试用例覆盖路由可达性 / 角色拦截 / 空数据引导 / ErrorBoundary / 401
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactElement, Component } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, Navigate } from 'react-router-dom';
import { render as rtlRender } from '@testing-library/react';
import { render, screen } from '../test/utils';
import { useAuth } from '../lib/auth';
import { api, setUnauthorizedHandler } from '../lib/api';
import { ErrorBoundary, ToastProvider } from '../components/ui';
import type { Role } from '../types';

// ─── Dynamic auth mock ─────────────────────────────────────────────────────
// vi.mock is hoisted, so the variables it captures must be created via
// vi.hoisted() so they exist at the hoisted scope level.

const mockAuth = vi.hoisted(() => ({
  role: 'recruiter' as Role,
  name: '测试用户',
  userId: 101,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    token: 'test-token',
    role: mockAuth.role,
    name: mockAuth.name,
    userId: mockAuth.userId,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Shared API mock (all endpoints return empty data) ─────────────────────

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCandidates: vi.fn().mockResolvedValue([]),
      listJobs: vi.fn().mockResolvedValue([]),
      biOverview: vi.fn().mockResolvedValue({
        funnel: {
          pending: 0, ai_screen: 0, interview: 0, offer: 0, onboarded: 0,
          archivedTotal: 0, conversionRate: 0, pipelineTotal: 0,
        },
        staff: [],
        demands: { activeTotal: 0, overdue: 0, hrNoRecommendation: 0, businessFeedbackPending: 0, priorityCounts: { A: 0, B: 0, C: 0 } },
        resumes: { totalCandidates: 0, linkedToJob: 0, unassigned: 0, matchedCandidates: 0, matchRate: 0, inPipeline: 0, notInPipeline: 0, pipelineEntryRate: 0 },
        sourceQuality: [],
        interviewerAccountability: [],
        departmentAccountability: [],
        alerts: [],
        dataQualityWarnings: [],
      }),
      biStaff: vi.fn().mockResolvedValue({
        performance: {
          effectiveRecommendations: 0, interviewEntries: 0, interviewPassed: 0,
          offerEntries: 0, onboarded: 0, feedbackPending: 0, businessReviewEntries: 0,
          recommendationToOnboardRate: 0,
        },
        funnel: { business_review: 0, interview: 0, offer: 0, onboarded: 0, conversionRate: 0 },
      }),
      listInterviewAssignments: vi.fn().mockResolvedValue([]),
      listConversations: vi.fn().mockResolvedValue({ items: [] }),
      createConversation: vi.fn(),
      updateConversation: vi.fn(),
      getPipelineBoard: vi.fn(),
      listCallLogs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listInterviewRecords: vi.fn().mockResolvedValue([]),
      listInterviewers: vi.fn().mockResolvedValue([]),
      getCandidate: vi.fn(),
      searchCandidates: vi.fn().mockResolvedValue({ candidates: [], total: 0 }),
    },
  };
});

// Mock agent module globally too
vi.mock('../lib/agent', async () => {
  const actual = await vi.importActual<typeof import('../lib/agent')>('../lib/agent');
  return {
    ...actual,
    fetchAgentTools: vi.fn().mockResolvedValue([]),
    streamChat: vi.fn(),
    executeWriteTool: vi.fn(),
  };
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function setMockAuth(role: Role, name?: string, userId?: number) {
  mockAuth.role = role;
  mockAuth.name = name ?? '测试用户';
  mockAuth.userId = userId ?? (role === 'recruiter' ? 101 : role === 'interviewer' ? 202 : 1);
}

/** Render without the test‑utils wrapper (to avoid nested MemoryRouter in route tests) */
function bareRender(ui: ReactElement, initialEntries: string[] = ['/']) {
  return rtlRender(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
}

/** A mini RequireRole component matching App.tsx logic */
function RequireRole({ allow, element }: { allow: Role[]; element: ReactElement }) {
  const { role } = useAuth();
  if (role && !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return element;
}

// ─── Test 14 helpers ───────────────────────────────────────────────────────

class ThrowOnMount extends Component<{ error: Error }, never> {
  componentDidMount() {
    throw this.props.error;
  }
  render() {
    return null;
  }
}

function BrokenPage() {
  return <ThrowOnMount error={new Error('测试错误')} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('SmokeRoutes', () => {
  beforeEach(() => {
    setMockAuth('recruiter'); // reset to default before each test
  });

  // ── 1. recruiter 工作台可达 ─────────────────────────────────────────────
  it('1. renders recruiter dashboard with welcome, performance, todo and actions', async () => {
    setMockAuth('recruiter', '测试招聘专员');
    const { DashboardPage } = await import('../pages/DashboardPage');
    render(<DashboardPage />);

    expect(await screen.findByText('欢迎回来，测试招聘专员')).toBeInTheDocument();
    expect(screen.getByText('我的本月业绩')).toBeInTheDocument();
    expect(screen.getByText('今日待办')).toBeInTheDocument();
    expect(screen.getByText('常用动作')).toBeInTheDocument();
  });

  // ── 2. recruiter 岗位画像可达 + 空数据引导 ─────────────────────────────
  it('2. renders JobsPage with header and empty-state guidance', async () => {
    const { JobsPage } = await import('../pages/JobsPage');
    render(<JobsPage />);

    expect(screen.getByRole('heading', { name: '岗位画像' })).toBeInTheDocument();
    expect(await screen.findByText('暂无在招岗位')).toBeInTheDocument();
    expect(screen.getByText('点击右上角「新增岗位」创建第一个招聘岗位')).toBeInTheDocument();
  });

  // ── 3. recruiter 候选人流程可达 ─────────────────────────────────────────
  it('3. renders PipelinePage with header and empty-state guidance', async () => {
    const { PipelinePage } = await import('../pages/PipelinePage');
    render(<PipelinePage />);

    expect(screen.getByText('候选人流程')).toBeInTheDocument();
    // Empty-state guidance: directs user to create job profiles first
    expect(await screen.findByText('请先创建岗位画像，再查看候选人流程')).toBeInTheDocument();
  });

  // ── 4. recruiter 上传简历可达 ───────────────────────────────────────────
  it('4. renders UploadPage with header', async () => {
    const { UploadPage } = await import('../pages/UploadPage');
    render(<UploadPage />);

    expect(screen.getByText('简历上传')).toBeInTheDocument();
  });

  // ── 5. recruiter AI 助手可达 ────────────────────────────────────────────
  it('5. renders AgentPage with AI assistant header', async () => {
    const { AgentPage } = await import('../pages/AgentPage');
    const { AgentChatProvider } = await import('../lib/agentChat');

    render(
      <AgentChatProvider>
        <AgentPage />
      </AgentChatProvider>,
    );

    expect(screen.getByText('AI 助手')).toBeInTheDocument();
    expect(await screen.findByText('你好，我是招聘智能助手')).toBeInTheDocument();
  });

  // ── 6. recruiter 数据看板不可达 ─────────────────────────────────────────
  it('6. prevents recruiter from accessing /bi – redirects to dashboard', async () => {
    const { DashboardPage } = await import('../pages/DashboardPage');
    const { BiPage } = await import('../pages/BiPage');

    bareRender(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/bi"
          element={<RequireRole allow={['manager', 'admin']} element={<BiPage />} />}
        />
      </Routes>,
      ['/bi'],
    );

    // Should redirect to / (Dashboard) because recruiter can't access /bi
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument();
    expect(screen.queryByText('数据看板')).not.toBeInTheDocument();
  });

  // ── 7. manager 数据看板可达 ─────────────────────────────────────────────
  it('7. renders BiPage for manager role', async () => {
    setMockAuth('manager');
    const { BiPage } = await import('../pages/BiPage');
    render(<BiPage />);

    expect(screen.getByText('数据看板')).toBeInTheDocument();
    expect(await screen.findByText('HR 绩效')).toBeInTheDocument();
  });

  // ── 8. interviewer 工作台可达 ───────────────────────────────────────────
  it('8. renders dashboard for interviewer with interviewer KPIs', async () => {
    setMockAuth('interviewer', '测试面试官');
    const { DashboardPage } = await import('../pages/DashboardPage');
    render(<DashboardPage />);

    expect(await screen.findByText('欢迎回来，测试面试官')).toBeInTheDocument();
    expect(screen.getByText('待我反馈')).toBeInTheDocument();
    expect(screen.getByText('今日面试')).toBeInTheDocument();
    expect(screen.getByText('已反馈')).toBeInTheDocument();
    expect(screen.getByText('超时待反馈')).toBeInTheDocument();
  });

  // ── 9. interviewer 我的面试可达 ─────────────────────────────────────────
  it('9. renders InterviewListPage with "我的面试" for interviewer', async () => {
    setMockAuth('interviewer');
    const { InterviewListPage } = await import('../pages/InterviewListPage');
    render(<InterviewListPage />);

    expect(await screen.findByText('我的面试')).toBeInTheDocument();
  });

  // ── 10. interviewer AI 助手不可达 ──────────────────────────────────────
  it('10. prevents interviewer from accessing /agent – redirects to dashboard', async () => {
    setMockAuth('interviewer');
    const { DashboardPage } = await import('../pages/DashboardPage');
    const { AgentPage } = await import('../pages/AgentPage');
    const { AgentChatProvider } = await import('../lib/agentChat');

    bareRender(
      <AgentChatProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/agent"
            element={<RequireRole allow={['recruiter', 'manager', 'admin']} element={<AgentPage />} />}
          />
        </Routes>
      </AgentChatProvider>,
      ['/agent'],
    );

    // Should redirect to / (Dashboard)
    expect(await screen.findByText(/欢迎回来/)).toBeInTheDocument();
    expect(screen.queryByText('AI 助手')).not.toBeInTheDocument();
  });

  // ── 11. admin 系统设置可达 ──────────────────────────────────────────────
  it('11. renders SystemSettingsPage with header and tabs', async () => {
    setMockAuth('admin');
    const { SystemSettingsPage } = await import('../pages/admin/SystemSettingsPage');
    render(<SystemSettingsPage />);

    expect(screen.getByText('系统设置')).toBeInTheDocument();
    // Check that tab titles appear (there may be duplicates, so use getAllByText)
    const accountMgmt = screen.getAllByText('账号管理');
    expect(accountMgmt.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('审计日志')).toBeInTheDocument();
  });

  // ── 12. admin AI 调用日志可达 ───────────────────────────────────────────
  it('12. renders AgentCallLogsPage with header and empty state', async () => {
    setMockAuth('admin');
    const { AgentCallLogsPage } = await import('../pages/admin/AgentCallLogsPage');
    render(<AgentCallLogsPage />);

    expect(screen.getByText('AI 调用日志')).toBeInTheDocument();
    expect(await screen.findByText('暂无调用记录')).toBeInTheDocument();
  });

  // ── 13. 空数据引导可见 — 候选人列表为空 ──────────────────────────────
  it('13. shows guidance text when candidates list is empty', async () => {
    const { CandidatesPage } = await import('../features/candidates/pages/CandidatesPage');
    render(<CandidatesPage />);

    expect(await screen.findByText('暂无简历')).toBeInTheDocument();
    const uploadLinks = screen.getAllByText(/上传简历/);
    expect(uploadLinks.length).toBeGreaterThanOrEqual(1);
  });

  // ── 14. ErrorBoundary 不白屏 ────────────────────────────────────────────
  it('14. shows error fallback UI when a child component throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BrokenPage />
      </ErrorBoundary>,
    );

    expect(screen.getByText('页面加载出错')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument();
  });

  // ── 15. 401 集中清 token ────────────────────────────────────────────────
  it('15. calls unauthorizedHandler when API returns 401', async () => {
    // Use the real (unmocked) api module so request() → fetch() is exercised
    const realApi = await vi.importActual<typeof import('../lib/api')>('../lib/api');

    const handler = vi.fn(() => {
      localStorage.removeItem('hireinsight_token');
    });
    realApi.setUnauthorizedHandler(handler);
    localStorage.setItem('hireinsight_token', 'expired-token');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(realApi.api.listCandidates()).rejects.toThrow('Unauthorized');
    expect(handler).toHaveBeenCalledTimes(1);
    // Verify the token was cleared from localStorage (matching AuthProvider's logout behavior)
    expect(localStorage.getItem('hireinsight_token')).toBeNull();

    fetchSpy.mockRestore();
    realApi.setUnauthorizedHandler(null);
  });
});
