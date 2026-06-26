// Typed API client for the HireInsight backend.
// All requests are prefixed with /api (proxied to the Flask server in dev).
// The JWT is read from localStorage and injected as a Bearer token.

import type {
  AdminAiArchitecture,
  AdminUserCreateInput,
  AdminUser,
  AuditLogQuery,
  AuditLogResponse,
  BatchAddToPipelineResponse,
  BiOverview,
  BiStaffDetail,
  BiJobDetail,
  CandidateDetail,
  CandidateListQuery,
  CandidateListItem,
  CandidateListResponse,
  CandidateJourney,
  CandidateOwnerOption,
  CandidatePipelines,
  CandidateProfileUpdateRequest,
  CreateJobRequest,
  CreateJobResponse,
  DemandCloseInput,
  DemandDowngradeInput,
  DemandRestoreInput,
  InterviewFeedbackInput,
  InterviewAssignment,
  InterviewAssignmentInput,
  InterviewGuide,
  InterviewListItem,
  InterviewerOption,
  InterviewRecord,
  InterviewStartRequest,
  InterviewStartResponse,
  InterviewSubmitRequest,
  InterviewSubmitResponse,
  JobListItem,
  JobDetail,
  JdClarifyResponse,
  LoginRequest,
  LoginResponse,
  MatchResponse,
  MeResponse,
  NotificationListResponse,
  OfferRecord,
  PipelineBoard,
  PipelineHistory,
  PipelineCounts,
  PipelineMoveRequest,
  PipelineMoveResponse,
  RegisterRequest,
  RegisterResponse,
  RecruitmentDemand,
  RecruitmentDemandInput,
  RetryParseResponse,
  ResumeUploadResponse,
  Role,
  TalentMap,
  TalentMapCompany,
  TalentMapCompanyInput,
  TalentMapFilters,
  TalentMapInput,
  TalentMapPerson,
  TalentMapPersonInput,
  TalentMapSummary,
  BossStatus,
  BossLoginGuide,
  BossJob,
  BossSearchParams,
  BossRecommendParams,
  BossInboxParams,
  BossAccount,
  BossQrStartResult,
  BossQrStatusResult,
  BossBatchImportParams,
  BossBatchImportResult,
  BossAiScreenParams,
  BossAiScreenResult,
  BossInviteInterviewParams,
  BossInviteInterviewResult,
} from '../types';

const API_BASE = '/api';
export const TOKEN_KEY = 'hireinsight_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Error surfaced to callers; carries HTTP status and any backend message.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Global 401 handling. The AuthProvider registers its `logout` here on mount
// (see auth.tsx) so an expired/invalid token clears the session and bounces the
// user to login once, centrally, instead of every page handling 401 itself.
// A setter (rather than a direct import of auth.tsx) keeps api.ts free of any
// dependency on React/auth and avoids a circular import.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn;
}

interface RequestOptions {
  method?: string;
  // JSON body (omit for GET / multipart).
  body?: unknown;
  // Raw body for multipart uploads; Content-Type is left to the browser.
  formData?: FormData;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData } = opts;
  const headers: Record<string, string> = {};

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  } catch (err) {
    throw new ApiError(0, `Network error: ${(err as Error).message}`);
  }

  // Parse JSON when present; some endpoints may return empty bodies.
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    // A 401 means the token is missing/expired/invalid: clear the session and
    // redirect to login centrally via the registered handler.
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    // 错误体形态有两种：
    //   1) 多数蓝图：{ error: "字符串消息" }
    //   2) boss 蓝图：{ ok:false, error: { code, message } }（嵌套对象）
    // 对嵌套对象需取 error.message，否则 String(对象) 会得到 "[object Object]"，
    // 既丢失真实提示，也让上层基于 message 文本的错误分类失效。
    const rawError =
      data && typeof data === 'object' && 'error' in data
        ? (data as Record<string, unknown>).error
        : null;
    const nestedErrorMessage =
      rawError && typeof rawError === 'object' && 'message' in rawError
        ? String((rawError as Record<string, unknown>).message)
        : null;
    const message =
      nestedErrorMessage ||
      (typeof rawError === 'string' ? rawError : null) ||
      (data && typeof data === 'object' && 'message' in data
        ? String((data as Record<string, unknown>).message)
        : null) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

// Boss 端点返回 {ok, data, error?} 信封；解包 data，错误抛 ApiError。
async function bossRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request<{ ok: boolean; data: T; error?: { code: string; message: string } }>(path, opts);
  if (!res.ok) {
    throw new ApiError(0, res.error?.message ?? 'BOSS 接口错误');
  }
  return res.data;
}

export const api = {
  // ---- Auth ----
  register(payload: RegisterRequest): Promise<RegisterResponse> {
    return request('/auth/register', { method: 'POST', body: payload });
  },
  login(payload: LoginRequest): Promise<LoginResponse> {
    return request('/auth/login', { method: 'POST', body: payload });
  },

  // ---- Resume / Candidates ----
  uploadResumes(
    files: File[],
    source?: {
      source_channel?: string;
      source_link?: string;
      referrer?: string;
      target_job_id?: number | null;
      source_note?: string;
    },
  ): Promise<ResumeUploadResponse> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    if (source) {
      Object.entries(source).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          form.append(key, String(value));
        }
      });
    }
    return request('/resume/upload', { method: 'POST', formData: form });
  },
  getCandidate(candidateId: number): Promise<CandidateDetail> {
    return request(`/resume/${candidateId}`);
  },
  retryCandidateParse(candidateId: number): Promise<RetryParseResponse> {
    return request(`/resume/${candidateId}/retry-parse`, { method: 'POST' });
  },
  updateCandidateProfile(
    candidateId: number,
    payload: CandidateProfileUpdateRequest,
  ): Promise<CandidateDetail> {
    return request(`/resume/${candidateId}/profile`, { method: 'PATCH', body: payload });
  },
  listCandidates(): Promise<CandidateListItem[]> {
    return request('/candidates');
  },
  listCandidateOwners(): Promise<CandidateOwnerOption[]> {
    return request('/candidates/owner-options');
  },
  searchCandidates(params: CandidateListQuery): Promise<CandidateListResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    return request(`/candidates?${search.toString()}`);
  },

  // ---- Jobs ----
  createJob(payload: CreateJobRequest): Promise<CreateJobResponse> {
    return request('/jobs', { method: 'POST', body: payload });
  },
  // Ask the AI which key details the JD is missing, before saving.
  clarifyJob(title: string, jdText: string): Promise<JdClarifyResponse> {
    return request('/jobs/clarify', {
      method: 'POST',
      body: { title, jd_text: jdText },
    });
  },
  // Single job detail incl. structured JD.
  getJob(jobId: number): Promise<JobDetail> {
    return request(`/jobs/${jobId}`);
  },
  // Edit a job's title / JD / attribution fields. JD change re-runs structuring server-side.
  updateJob(
    jobId: number,
    payload: {
      title?: string;
      jd_text?: string;
      city?: string;
      department?: string;
      job_code?: string;
    },
  ): Promise<JobDetail> {
    return request(`/jobs/${jobId}`, { method: 'PUT', body: payload });
  },
  // Close (take offline) a job — soft close, status=closed.
  closeJob(jobId: number): Promise<{ id: number; status: string }> {
    return request(`/jobs/${jobId}/close`, { method: 'POST' });
  },
  // Restore a closed job to active hiring.
  restoreJob(jobId: number): Promise<{ id: number; status: string }> {
    return request(`/jobs/${jobId}/restore`, { method: 'POST' });
  },
  listJobs(status?: 'active' | 'closed' | 'all'): Promise<JobListItem[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/jobs${suffix}`);
  },
  // ---- Recruitment demands ----
  listDemands(): Promise<RecruitmentDemand[]> {
    return request('/demands');
  },
  getDemand(demandId: number): Promise<RecruitmentDemand> {
    return request(`/demands/${demandId}`);
  },
  createDemand(payload: RecruitmentDemandInput): Promise<RecruitmentDemand> {
    return request('/demands', { method: 'POST', body: payload });
  },
  updateDemand(
    demandId: number,
    payload: Partial<RecruitmentDemandInput>,
  ): Promise<RecruitmentDemand> {
    return request(`/demands/${demandId}`, { method: 'PATCH', body: payload });
  },
  closeDemand(demandId: number, payload: DemandCloseInput): Promise<RecruitmentDemand> {
    return request(`/demands/${demandId}/close`, { method: 'POST', body: payload });
  },
  downgradeDemand(demandId: number, payload: DemandDowngradeInput): Promise<RecruitmentDemand> {
    return request(`/demands/${demandId}/downgrade`, { method: 'POST', body: payload });
  },
  restoreDemand(demandId: number, payload: DemandRestoreInput = {}): Promise<RecruitmentDemand> {
    return request(`/demands/${demandId}/restore`, { method: 'POST', body: payload });
  },

  // ---- Talent maps ----
  listTalentMaps(): Promise<TalentMapSummary[]> {
    return request('/talent-maps');
  },
  createTalentMap(payload: TalentMapInput): Promise<TalentMap> {
    return request('/talent-maps', { method: 'POST', body: payload });
  },
  getTalentMap(mapId: number, filters: TalentMapFilters = {}): Promise<TalentMap> {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request(`/talent-maps/${mapId}${suffix}`);
  },
  updateTalentMap(mapId: number, payload: Partial<TalentMapInput>): Promise<TalentMap> {
    return request(`/talent-maps/${mapId}`, { method: 'PATCH', body: payload });
  },
  createTalentMapCompany(
    mapId: number,
    payload: TalentMapCompanyInput,
  ): Promise<TalentMapCompany> {
    return request(`/talent-maps/${mapId}/companies`, { method: 'POST', body: payload });
  },
  createTalentMapPerson(mapId: number, payload: TalentMapPersonInput): Promise<TalentMapPerson> {
    return request(`/talent-maps/${mapId}/people`, { method: 'POST', body: payload });
  },
  updateTalentMapPerson(
    personId: number,
    payload: Partial<TalentMapPersonInput>,
  ): Promise<TalentMapPerson> {
    return request(`/talent-map-people/${personId}`, { method: 'PATCH', body: payload });
  },
  // CANONICAL match endpoint — feature pages (F3 job-to-candidate match) should
  // use this RESTful, job-scoped method.
  matchJob(jobId: number): Promise<MatchResponse> {
    return request(`/jobs/${jobId}/match`, { method: 'POST' });
  },
  previewJobMatch(jobId: number, candidateIds?: number[]): Promise<MatchResponse> {
    const search = new URLSearchParams();
    if (candidateIds?.length) {
      search.set('candidate_ids', candidateIds.join(','));
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request(`/jobs/${jobId}/match-preview${suffix}`);
  },
  batchAddToPipeline(
    jobId: number,
    candidateIds: number[],
  ): Promise<BatchAddToPipelineResponse> {
    return request(`/jobs/${jobId}/batch-pipeline`, {
      method: 'POST',
      body: { candidate_ids: candidateIds },
    });
  },
  // Thin alias kept only for backend compatibility (POST /match with job_id in
  // the body). Prefer matchJob above; do not build new pages on this.
  match(jobId: number): Promise<MatchResponse> {
    return request('/match', { method: 'POST', body: { job_id: jobId } });
  },

  // ---- Interview ----
  startInterview(payload: InterviewStartRequest): Promise<InterviewStartResponse> {
    return request('/interview/start', { method: 'POST', body: payload });
  },
  submitInterview(payload: InterviewSubmitRequest): Promise<InterviewSubmitResponse> {
    return request('/interview/submit', { method: 'POST', body: payload });
  },
  getInterview(interviewId: number): Promise<InterviewRecord> {
    return request(`/interview/${interviewId}`);
  },
  listInterviews(): Promise<InterviewListItem[]> {
    return request('/interviews');
  },
  submitFeedback(payload: InterviewFeedbackInput): Promise<{ id: number; status: string }> {
    return request('/interview/feedback', { method: 'POST', body: payload });
  },
  listInterviewers(): Promise<InterviewerOption[]> {
    return request('/interview/interviewers');
  },
  listInterviewAssignments(): Promise<InterviewAssignment[]> {
    return request('/interview/assignments');
  },
  createInterviewAssignment(payload: InterviewAssignmentInput): Promise<InterviewAssignment> {
    return request('/interview/assignments', { method: 'POST', body: payload });
  },
  getInterviewGuide(candidateId: number, jobId: number, round: string): Promise<InterviewGuide> {
    return request(`/interview/guide?candidate_id=${candidateId}&job_id=${jobId}&round=${round}`);
  },

  // ---- Pipeline ----
  movePipeline(payload: PipelineMoveRequest): Promise<PipelineMoveResponse> {
    return request('/pipeline/move', { method: 'POST', body: payload });
  },
  getPipeline(jobId: number): Promise<PipelineCounts> {
    return request(`/pipeline/${jobId}`);
  },
  // Per-candidate board: who is at which stage right now for this job.
  getPipelineBoard(jobId: number): Promise<PipelineBoard> {
    return request(`/pipeline/${jobId}/board`);
  },
  // Stage-transition timeline for one candidate in one job.
  getPipelineHistory(jobId: number, candidateId: number): Promise<PipelineHistory> {
    return request(`/pipeline/${jobId}/history/${candidateId}`);
  },
  getOfferRecord(jobId: number, candidateId: number): Promise<OfferRecord> {
    return request(`/pipeline/${jobId}/offer/${candidateId}`);
  },
  saveOfferRecord(jobId: number, candidateId: number, payload: Partial<OfferRecord>): Promise<OfferRecord> {
    return request(`/pipeline/${jobId}/offer/${candidateId}`, { method: 'PUT', body: payload });
  },

  // ---- BI (manager/admin only) ----
  biOverview(days = 30): Promise<BiOverview> {
    return request(`/bi/overview?days=${days}`);
  },
  biStaff(hrId: number, days = 30): Promise<BiStaffDetail> {
    return request(`/bi/staff/${hrId}?days=${days}`);
  },
  // Single-job funnel — all roles.
  biJob(jobId: number, days = 90): Promise<BiJobDetail> {
    return request(`/bi/job/${jobId}?days=${days}`);
  },

  // ---- Account ----
  getMe(): Promise<MeResponse> {
    return request('/auth/me');
  },
  changePassword(oldPassword: string, newPassword: string): Promise<{ status: string }> {
    return request('/auth/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
    });
  },

  // ---- Admin (admin-only) ----
  listUsers(): Promise<AdminUser[]> {
    return request('/admin/users');
  },
  createUser(payload: AdminUserCreateInput): Promise<AdminUser> {
    return request('/admin/users', { method: 'POST', body: payload });
  },
  updateUser(
    userId: number,
    payload: { role?: Role; is_active?: boolean },
  ): Promise<AdminUser> {
    return request(`/admin/users/${userId}`, { method: 'PATCH', body: payload });
  },
  resetUserPassword(userId: number, password: string): Promise<{ status: string; id: number }> {
    return request(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: { password },
    });
  },
  getAdminAiArchitecture(): Promise<AdminAiArchitecture> {
    return request('/admin/ai-architecture');
  },
  getAuditLogs(params: AuditLogQuery = {}): Promise<AuditLogResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    const query = search.toString();
    return request(`/admin/audit-logs${query ? `?${query}` : ''}`);
  },

  // ---- Notifications ----
  getNotifications(page = 1, perPage = 20): Promise<NotificationListResponse> {
    return request(`/notifications?page=${page}&per_page=${perPage}`);
  },
  getUnreadCount(): Promise<{ unread_count: number }> {
    return request('/notifications/unread-count');
  },
  markNotificationsRead(ids?: number[]): Promise<{ status: string }> {
    return request('/notifications/mark-read', {
      method: 'POST',
      body: ids && ids.length > 0 ? { ids } : {},
    });
  },

  // ---- Candidate pipeline context / journey / reassignment (M4/M5) ----
  getCandidatePipelines(candidateId: number): Promise<CandidatePipelines> {
    return request(`/candidates/${candidateId}/pipelines`);
  },
  getCandidateJourney(candidateId: number, jobId: number): Promise<CandidateJourney> {
    return request(`/candidates/${candidateId}/journey?job_id=${jobId}`);
  },
  reassignCandidate(
    candidateId: number,
    ownerHrId: number,
    reason: string,
  ): Promise<{ candidate_id: number; owner_hr_id: number; reason: string }> {
    return request(`/candidates/${candidateId}/owner`, {
      method: 'PATCH',
      body: { owner_hr_id: ownerHrId, reason },
    });
  },

  // ---- BOSS 直聘集成（boss-cli 招聘端）----
  // 后端统一返回 {ok, data}；bossRequest 解包 data。错误以 ApiError 抛出。
  bossStatus(): Promise<BossStatus> {
    return bossRequest('/boss/status');
  },
  bossLoginGuide(): Promise<BossLoginGuide> {
    return bossRequest('/boss/login/guide');
  },
  bossLoginCookie(browser = 'chrome'): Promise<BossStatus> {
    return bossRequest('/boss/login/cookie', { method: 'POST', body: { browser } });
  },
  bossJobs(): Promise<BossJob[]> {
    return bossRequest('/boss/jobs');
  },
  bossJobClose(encryptJobId: string): Promise<{ status: string }> {
    return bossRequest(`/boss/jobs/${encodeURIComponent(encryptJobId)}/close`, { method: 'POST' });
  },
  bossJobReopen(encryptJobId: string): Promise<{ status: string }> {
    return bossRequest(`/boss/jobs/${encodeURIComponent(encryptJobId)}/reopen`, { method: 'POST' });
  },
  bossSearchCandidates(params: BossSearchParams): Promise<unknown> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return bossRequest(`/boss/candidates/search?${qs}`);
  },
  bossRecommendCandidates(params: BossRecommendParams): Promise<unknown> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return bossRequest(`/boss/candidates/recommend?${qs}`);
  },
  bossInbox(params: BossInboxParams): Promise<unknown> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    });
    return bossRequest(`/boss/candidates/inbox?${qs}`);
  },
  bossResume(
    encryptGeekId: string,
    params?: { job?: string; security_id?: string },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, String(v));
    });
    return bossRequest(`/boss/candidates/${encodeURIComponent(encryptGeekId)}/resume?${qs}`);
  },
  bossGreet(encryptGeekId: string, body?: { job?: string }): Promise<unknown> {
    return bossRequest(`/boss/candidates/${encodeURIComponent(encryptGeekId)}/greet`, {
      method: 'POST',
      body: body ?? {},
    });
  },
  bossRequestResume(encryptGeekId: string, friendId: number): Promise<unknown> {
    return bossRequest(`/boss/candidates/${encodeURIComponent(encryptGeekId)}/request-resume`, {
      method: 'POST',
      body: { friend_id: friendId },
    });
  },
  bossReply(friendId: number, message: string): Promise<unknown> {
    return bossRequest(`/boss/chat/${friendId}/reply`, { method: 'POST', body: { message } });
  },

  // ---- 招聘闭环：批量导入 / AI 初筛 / 面试邀请 ----
  // 批量下载并导入收件箱候选人简历到候选人库（限量+间隔+去重）。
  bossBatchImport(params: BossBatchImportParams): Promise<BossBatchImportResult> {
    return bossRequest('/boss/candidates/batch-import', { method: 'POST', body: params });
  },
  // 对已导入候选人做 AI 简历初筛（LLM 评估 + 写 Interview + 推进 ai_screen）。
  bossAiScreen(params: BossAiScreenParams): Promise<BossAiScreenResult> {
    return bossRequest('/boss/candidates/ai-screen', { method: 'POST', body: params });
  },
  // 发送面试邀请（BOSS invite-interview + 系统双写），需前端人工确认后调用。
  bossInviteInterview(params: BossInviteInterviewParams): Promise<BossInviteInterviewResult> {
    return bossRequest('/boss/candidates/invite-interview', { method: 'POST', body: params });
  },
  // 简历下载走专用 URL（返回 text/markdown），由调用方用 window.open 触发；
  // ?token= 让后端做查询参数鉴权（无法带 Authorization 头）。
  bossResumeDownloadUrl(encryptGeekId: string, params?: { job?: string; security_id?: string }): string {
    const qs = new URLSearchParams();
    if (params) Object.entries(params).forEach(([k, v]) => {
      if (v) qs.set(k, String(v));
    });
    const token = getToken();
    if (token) qs.set('token', token);
    return `${API_BASE}/boss/candidates/${encodeURIComponent(encryptGeekId)}/resume/download?${qs}`;
  },

  // ---- BOSS 账号管理 + 扫码登录 ----
  bossQrLoginStart(): Promise<BossQrStartResult> {
    return bossRequest('/boss/qr-login/start', { method: 'POST' });
  },
  bossQrLoginStatus(sessionId: string): Promise<BossQrStatusResult> {
    return bossRequest(`/boss/qr-login/status?session_id=${encodeURIComponent(sessionId)}`);
  },
  bossQrLoginConfirm(sessionId: string, label: string): Promise<BossAccount> {
    return bossRequest('/boss/qr-login/confirm', { method: 'POST', body: { session_id: sessionId, label } });
  },
  bossAccounts(): Promise<BossAccount[]> {
    return bossRequest('/boss/accounts');
  },
  bossActivateAccount(accountId: number): Promise<void> {
    return bossRequest(`/boss/accounts/${accountId}/activate`, { method: 'POST' });
  },
  bossDeleteAccount(accountId: number): Promise<void> {
    return bossRequest(`/boss/accounts/${accountId}`, { method: 'DELETE' });
  },
  bossVerifyAccount(accountId: number): Promise<{ authenticated: boolean; status: unknown }> {
    return bossRequest(`/boss/accounts/${accountId}/verify`, { method: 'POST' });
  },
};
