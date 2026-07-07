import { api } from '../../lib/api';
import type { BiManagerAlert, BiStaffMember, InterviewAssignment, Role } from '../../types';

export interface InterviewerTaskStats {
  pendingFeedback: number | null;
  todayInterviews: number | null;
  submittedFeedback: number | null;
  overdueFeedback: number | null;
}

export interface DashboardStats {
  candidates: number | null;
  jobs: number | null;
  businessReview: number | null;
  interview: number | null;
  offer: number | null;
  onboarded: number | null;
  conversionRate: number | null;
  alerts: BiManagerAlert[];
  performance: BiStaffMember | null;
  interviewerTasks: InterviewerTaskStats;
}

export interface DashboardStatsApi {
  listCandidates: typeof api.listCandidates;
  listJobs: typeof api.listJobs;
  biOverview: typeof api.biOverview;
  biStaff: typeof api.biStaff;
  listInterviewAssignments: typeof api.listInterviewAssignments;
}

export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  candidates: null,
  jobs: null,
  businessReview: null,
  interview: null,
  offer: null,
  onboarded: null,
  conversionRate: null,
  alerts: [],
  performance: null,
  interviewerTasks: {
    pendingFeedback: null,
    todayInterviews: null,
    submittedFeedback: null,
    overdueFeedback: null,
  },
};

function isToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

export function buildInterviewerTaskStats(assignments: InterviewAssignment[]): InterviewerTaskStats {
  return {
    pendingFeedback: assignments.filter((item) => !item.feedback_submitted).length,
    todayInterviews: assignments.filter((item) => isToday(item.scheduled_at)).length,
    submittedFeedback: assignments.filter((item) => item.feedback_submitted).length,
    overdueFeedback: assignments.filter((item) => item.is_overdue && !item.feedback_submitted).length,
  };
}

export async function loadDashboardStats(
  role: Role | null,
  userId: number | null,
  apiClient: DashboardStatsApi = api,
): Promise<DashboardStats> {
  if (!role) {
    return EMPTY_DASHBOARD_STATS;
  }

  const wantsTeamBi = role === 'manager' || role === 'admin';
  const wantsOwnBi = role === 'recruiter' && userId != null;
  const wantsInterviewTasks = role === 'interviewer';

  const candidatesP = wantsInterviewTasks ? Promise.resolve([]) : apiClient.listCandidates();
  const jobsP = wantsInterviewTasks ? Promise.resolve([]) : apiClient.listJobs();
  const biP = wantsTeamBi
    ? apiClient.biOverview()
    : wantsOwnBi
      ? apiClient.biStaff(userId)
      : Promise.resolve(null);
  const assignmentsP = wantsInterviewTasks
    ? apiClient.listInterviewAssignments()
    : Promise.resolve([] as InterviewAssignment[]);

  const [candidatesR, jobsR, biR, assignmentsR] = await Promise.allSettled([
    candidatesP,
    jobsP,
    biP,
    assignmentsP,
  ]);

  const next: DashboardStats = {
    ...EMPTY_DASHBOARD_STATS,
    interviewerTasks: { ...EMPTY_DASHBOARD_STATS.interviewerTasks },
    alerts: [],
  };

  if (candidatesR.status === 'fulfilled') next.candidates = candidatesR.value.length;
  if (jobsR.status === 'fulfilled') next.jobs = jobsR.value.length;
  if (assignmentsR.status === 'fulfilled' && wantsInterviewTasks) {
    next.interviewerTasks = buildInterviewerTaskStats(assignmentsR.value);
  }
  if (biR.status === 'fulfilled' && biR.value) {
    const funnel = biR.value.funnel;
    next.businessReview = funnel.business_review ?? 0;
    next.interview = funnel.interview ?? 0;
    next.offer = funnel.offer ?? 0;
    next.onboarded = funnel.onboarded ?? 0;
    next.conversionRate = Number.isFinite(funnel.conversion_rate) ? funnel.conversion_rate : 0;
    if ('performance' in biR.value && biR.value.performance) {
      const performance = biR.value.performance;
      next.performance = performance;
      next.businessReview = performance.business_review_entries;
      next.interview = performance.interview_entries;
      next.offer = performance.offer_entries;
      next.onboarded = performance.onboarded;
      next.conversionRate = Number.isFinite(performance.recommendation_to_onboard_rate)
        ? performance.recommendation_to_onboard_rate
        : 0;
    }
    if ('alerts' in biR.value) next.alerts = biR.value.alerts ?? [];
  }

  return next;
}
