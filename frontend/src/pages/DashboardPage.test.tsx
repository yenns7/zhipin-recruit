import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../test/utils';
import { DashboardPage } from './DashboardPage';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    token: 'test-token',
    role: 'recruiter',
    name: '测试招聘专员',
    userId: 101,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCandidates: vi.fn().mockResolvedValue([]),
      listJobs: vi.fn().mockResolvedValue([]),
      biOverview: vi.fn(),
      biStaff: vi.fn().mockResolvedValue({
        performance: {
          effectiveRecommendations: 0,
          interviewEntries: 0,
          interviewPassed: 0,
          offerEntries: 0,
          onboarded: 0,
          feedbackPending: 0,
          businessReviewEntries: 0,
          recommendationToOnboardRate: 0,
        },
        funnel: {
          business_review: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          conversionRate: 0,
        },
      }),
      listInterviewAssignments: vi.fn().mockResolvedValue([]),
    },
  };
});

describe('DashboardPage', () => {
  it('renders recruiter welcome, performance, todo and common actions sections', async () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole('heading', { name: '欢迎回来，测试招聘专员' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('我的本月业绩')).toBeInTheDocument();
    expect(screen.getByText('今日待办')).toBeInTheDocument();
    expect(screen.getByText('常用动作')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /上传简历/ }).length).toBeGreaterThan(0);
  });
});
