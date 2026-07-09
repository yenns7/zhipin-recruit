import { describe, expect, it, vi } from 'vitest';
import { EMPTY_DASHBOARD_STATS, loadDashboardStats } from './dashboardStats';

describe('dashboardStats', () => {
  it('aggregates recruiter stats from candidate, job and personal BI responses', async () => {
    const apiClient = {
      listCandidates: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      listJobs: vi.fn().mockResolvedValue([{ id: 10 }]),
      biOverview: vi.fn(),
      biStaff: vi.fn().mockResolvedValue({
        performance: {
          effectiveRecommendations: 3,
          interviewEntries: 2,
          interviewPassed: 1,
          offerEntries: 1,
          onboarded: 1,
          feedbackPending: 4,
          businessReviewEntries: 5,
          recommendationToOnboardRate: 25.5,
        },
        funnel: {
          business_review: 5,
          interview: 2,
          offer: 1,
          onboarded: 1,
          conversionRate: 25.5,
        },
      }),
      listInterviewAssignments: vi.fn(),
    };

    const stats = await loadDashboardStats('recruiter', 101, apiClient);

    expect(apiClient.biStaff).toHaveBeenCalledWith(101);
    expect(stats.candidates).toBe(2);
    expect(stats.jobs).toBe(1);
    expect(stats.performance?.feedbackPending).toBe(4);
    expect(stats.businessReview).toBe(5);
    expect(stats.interview).toBe(2);
    expect(stats.conversionRate).toBe(25.5);
    expect(apiClient.listInterviewAssignments).not.toHaveBeenCalled();
  });

  it('builds interviewer task counters without loading candidate and BI lists', async () => {
    const today = new Date().toISOString();
    const apiClient = {
      listCandidates: vi.fn(),
      listJobs: vi.fn(),
      biOverview: vi.fn(),
      biStaff: vi.fn(),
      listInterviewAssignments: vi.fn().mockResolvedValue([
        {
          id: 1,
          candidateId: 11,
          nameMasked: '候选人A',
          jobId: 21,
          jobTitle: '前端工程师',
          round: 'first_round',
          interviewerId: 7,
          interviewerName: '面试官甲',
          scheduledAt: today,
          location: '会议室A',
          note: '',
          status: 'scheduled',
          feedbackSubmitted: false,
          isOverdue: true,
          createdByName: 'HR',
          createdAt: today,
        },
        {
          id: 2,
          candidateId: 12,
          nameMasked: '候选人B',
          jobId: 22,
          jobTitle: '后端工程师',
          round: 'first_round',
          interviewerId: 7,
          interviewerName: '面试官甲',
          scheduledAt: today,
          location: '会议室B',
          note: '',
          status: 'done',
          feedbackSubmitted: true,
          isOverdue: false,
          createdByName: 'HR',
          createdAt: today,
        },
      ]),
    };

    const stats = await loadDashboardStats('interviewer', 7, apiClient);

    expect(apiClient.listCandidates).not.toHaveBeenCalled();
    expect(apiClient.listJobs).not.toHaveBeenCalled();
    expect(apiClient.biOverview).not.toHaveBeenCalled();
    expect(apiClient.biStaff).not.toHaveBeenCalled();
    expect(stats.interviewerTasks.pendingFeedback).toBe(1);
    expect(stats.interviewerTasks.todayInterviews).toBe(2);
    expect(stats.interviewerTasks.submittedFeedback).toBe(1);
    expect(stats.interviewerTasks.overdueFeedback).toBe(1);
  });

  it('returns the shared empty stats shape when no dashboard role is available', async () => {
    const apiClient = {
      listCandidates: vi.fn(),
      listJobs: vi.fn(),
      biOverview: vi.fn(),
      biStaff: vi.fn(),
      listInterviewAssignments: vi.fn(),
    };

    const stats = await loadDashboardStats(null, null, apiClient);

    expect(stats).toEqual(EMPTY_DASHBOARD_STATS);
    expect(apiClient.listCandidates).not.toHaveBeenCalled();
  });
});
