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
          effective_recommendations: 3,
          interview_entries: 2,
          interview_passed: 1,
          offer_entries: 1,
          onboarded: 1,
          feedback_pending: 4,
          business_review_entries: 5,
          recommendation_to_onboard_rate: 25.5,
        },
        funnel: {
          business_review: 5,
          interview: 2,
          offer: 1,
          onboarded: 1,
          conversion_rate: 25.5,
        },
      }),
      listInterviewAssignments: vi.fn(),
    };

    const stats = await loadDashboardStats('recruiter', 101, apiClient);

    expect(apiClient.biStaff).toHaveBeenCalledWith(101);
    expect(stats.candidates).toBe(2);
    expect(stats.jobs).toBe(1);
    expect(stats.performance?.feedback_pending).toBe(4);
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
          candidate_id: 11,
          name_masked: '候选人A',
          job_id: 21,
          job_title: '前端工程师',
          round: 'first_round',
          interviewer_id: 7,
          interviewer_name: '面试官甲',
          scheduled_at: today,
          location: '会议室A',
          note: '',
          status: 'scheduled',
          feedback_submitted: false,
          is_overdue: true,
          created_by_name: 'HR',
          created_at: today,
        },
        {
          id: 2,
          candidate_id: 12,
          name_masked: '候选人B',
          job_id: 22,
          job_title: '后端工程师',
          round: 'first_round',
          interviewer_id: 7,
          interviewer_name: '面试官甲',
          scheduled_at: today,
          location: '会议室B',
          note: '',
          status: 'done',
          feedback_submitted: true,
          is_overdue: false,
          created_by_name: 'HR',
          created_at: today,
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
