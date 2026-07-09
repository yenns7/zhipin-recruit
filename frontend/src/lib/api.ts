// Typed API client for the HireInsight backend (Spring Boot, Java).
// All requests are prefixed with /api/v1 (proxied to the Java backend in dev).
// The JWT is read from localStorage and injected as a Bearer token.
//
// Backend contract: every REST endpoint returns an ApiResponse envelope:
//   { code: number, message: string, data: T | null, timestamp: number }
// request<T>() unwraps `.data` so callers receive the business payload directly.
// Errors also use the envelope; the message field carries the human text and,
// for validation errors, the field map lives under `.data`.

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
  BossJob,
  BossRecommendParams,
  BossInboxParams,
  BossAccount,
  BossBatchImportParams,
  BossBatchImportResult,
  BossAiScreenParams,
  BossAiScreenResult,
  ConversationListResponse,
  ConversationDetail,
  CreateConversationResponse,
  UpdateConversationResponse,
  AgentCallLogItem,
  CallLogListResponse,
  CallLogQuery,
} from '../types';

export const API_BASE = '/api/v1';
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
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    // A 401 means the token is missing/expired/invalid: clear the session and
    // redirect to login centrally via the registered handler.
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    // Java 后端错误体统一为 { code, message, data?, timestamp }。
    // message 是人类可读提示；校验错误的字段明细放在 data（一个 map）。
    // 兼容个别仍返回 { error: "..." } 的历史形态，避免丢消息。
    const envelope =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const message =
      (envelope && typeof envelope.message === 'string' && envelope.message) ||
      (envelope && typeof envelope.error === 'string' && envelope.error) ||
      `Request failed with status ${res.status}`;
    const code =
      envelope && typeof envelope.code === 'number'
        ? String(envelope.code)
        : undefined;
    throw new ApiError(res.status, message, code);
  }

  // 成功：解包 ApiResponse.data。SSE/裸文本响应（非对象）原样返回。
  const envelope =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  if (envelope && 'data' in envelope) {
    return envelope.data as T;
  }
  return parsed as T;
}

// Boss 端点与其它 REST 端点一样返回标准 ApiResponse {code,message,data}；
// request() 已统一解包 data，因此 bossRequest 直接复用，无需额外信封处理。
async function bossRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return request<T>(path, opts);
}

export const api = {
  // ---- Auth ----
  register(payload: RegisterRequest): Promise<RegisterResponse> {
    return request('/auth/register', { method: 'POST', body: payload });
  },
  login(payload: LoginRequest): Promise<LoginResponse> {
    return request('/auth/login', { method: 'POST', body: payload });
  },
  logout(): Promise<{ status: string }> {
    return request('/auth/logout', { method: 'POST' });
  },

  // ---- Resume / Candidates ----
  uploadResumes(
    files: File[],
    source?: {
      source?: string;
      channel?: string;
      notes?: string;
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
    return request('/resumes/upload', { method: 'POST', formData: form });
  },
  getCandidate(candidateId: number): Promise<CandidateDetail> {
    return request(`/candidates/${candidateId}`);
  },
  retryCandidateParse(candidateId: number): Promise<RetryParseResponse> {
    return request(`/resumes/${candidateId}/retry-parse`, { method: 'POST' });
  },
  updateCandidateProfile(
    candidateId: number,
    payload: CandidateProfileUpdateRequest,
  ): Promise<CandidateDetail> {
    // Java 后端 CandidateController 暂无 profile 更新端点；保留方法签名以兼容旧调用，
    // 联调期间如被调用会返回 404，待后端补端点或前端移除该入口。
    return request(`/candidates/${candidateId}/profile`, { method: 'PATCH', body: payload });
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
  // Java 后端 JobController 暂无 JD 澄清端点（/jobs/clarify 返回 500/404）。
  // 保留方法以兼容旧调用，待后端补端点后恢复。
  clarifyJob(title: string, jdText: string): Promise<JdClarifyResponse> {
    return request('/jobs/clarify', {
      method: 'POST',
      body: { title, jdText },
    });
  },
  // Single job detail incl. structured JD.
  getJob(jobId: number): Promise<JobDetail> {
    return request(`/jobs/${jobId}`);
  },
  // Edit a job's title / JD. JD change re-runs structuring server-side.
  updateJob(
    jobId: number,
    payload: {
      title?: string;
      jdText?: string;
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
  matchJob(jobId: number, candidateIds?: number[]): Promise<MatchResponse> {
    return request(`/match/jobs/${jobId}/match`, {
      method: 'POST',
      body: candidateIds?.length ? { candidateIds } : {},
    });
  },
  previewJobMatch(jobId: number, candidateIds?: number[]): Promise<MatchResponse> {
    const search = new URLSearchParams();
    if (candidateIds?.length) {
      search.set('candidateIds', candidateIds.join(','));
    }
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request(`/match/jobs/${jobId}/preview${suffix}`);
  },
  batchAddToPipeline(
    jobId: number,
    candidateIds: number[],
  ): Promise<BatchAddToPipelineResponse> {
    // Java 后端无独立 batch-pipeline 端点；匹配并加入流程统一走
    // POST /match/jobs/{jobId}/match（带 candidateIds，初始阶段 ai_screen）。
    return request(`/match/jobs/${jobId}/match`, {
      method: 'POST',
      body: { candidateIds },
    });
  },
  // Thin alias kept only for backend compatibility (POST /match with jobId in
  // the body). Prefer matchJob above; do not build new pages on this.
  match(jobId: number, candidateIds?: number[]): Promise<MatchResponse> {
    return request('/match', { method: 'POST', body: { jobId, candidateIds: candidateIds ?? [] } });
  },

  // ---- Interview ----
  startInterview(payload: InterviewStartRequest): Promise<InterviewStartResponse> {
    return request('/interviews/start', { method: 'POST', body: payload });
  },
  submitInterview(payload: InterviewSubmitRequest): Promise<InterviewSubmitResponse> {
    return request('/interviews/submit', { method: 'POST', body: payload });
  },
  getInterview(interviewId: number): Promise<InterviewRecord> {
    return request(`/interviews/${interviewId}`);
  },
  listInterviews(): Promise<InterviewListItem[]> {
    return request('/interviews');
  },
  submitFeedback(payload: InterviewFeedbackInput): Promise<{ id: number; status: string }> {
    return request('/interviews/feedback', { method: 'POST', body: payload });
  },
  listInterviewers(): Promise<InterviewerOption[]> {
    return request('/interviews/interviewers');
  },
  listInterviewAssignments(): Promise<InterviewAssignment[]> {
    return request('/interviews/assignments');
  },
  createInterviewAssignment(payload: InterviewAssignmentInput): Promise<InterviewAssignment> {
    return request('/interviews/assignments', { method: 'POST', body: payload });
  },
  getInterviewGuide(candidateId: number, jobId: number, round: string): Promise<InterviewGuide> {
    return request(`/interviews/guide?candidateId=${candidateId}&jobId=${jobId}&round=${round}`);
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
    return request(`/pipeline/${jobId}/candidates/${candidateId}/history`);
  },
  getOfferRecord(jobId: number, candidateId: number): Promise<OfferRecord> {
    return request(`/pipeline/${jobId}/candidates/${candidateId}/offer`);
  },
  saveOfferRecord(jobId: number, candidateId: number, payload: Partial<OfferRecord>): Promise<OfferRecord> {
    return request(`/pipeline/${jobId}/candidates/${candidateId}/offer`, { method: 'PUT', body: payload });
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
    return request('/users/me');
  },
  changePassword(oldPassword: string, newPassword: string): Promise<{ status: string }> {
    return request('/users/me/password', {
      method: 'PUT',
      body: { currentPassword: oldPassword, newPassword },
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
    payload: { role?: Role; active?: boolean },
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

  // ---- AI 助手会话管理 ----
  listConversations(params: {
    archived?: boolean;
    page?: number;
    size?: number;
    q?: string;
  } = {}): Promise<ConversationListResponse> {
    const search = new URLSearchParams();
    if (params.archived !== undefined) search.set('archived', String(params.archived));
    if (params.page !== undefined) search.set('page', String(params.page));
    if (params.size !== undefined) search.set('size', String(params.size));
    if (params.q !== undefined) search.set('q', params.q);
    const query = search.toString();
    return request(`/agent/conversations${query ? `?${query}` : ''}`);
  },
  createConversation(title?: string): Promise<CreateConversationResponse> {
    return request('/agent/conversations', { method: 'POST', body: title ? { title } : {} });
  },
  getConversation(id: number): Promise<ConversationDetail> {
    return request(`/agent/conversations/${id}`);
  },
  updateConversation(
    id: number,
    payload: { title?: string; archived?: boolean },
  ): Promise<UpdateConversationResponse> {
    return request(`/agent/conversations/${id}`, { method: 'PATCH', body: payload });
  },
  deleteConversation(id: number): Promise<{ id: number; archived: boolean }> {
    return request(`/agent/conversations/${id}`, { method: 'DELETE' });
  },

  // ---- AI 调用日志（审计）----
  listCallLogs(params: CallLogQuery = {}): Promise<CallLogListResponse> {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    const query = search.toString();
    return request(`/agent/call-logs${query ? `?${query}` : ''}`);
  },
  getCallLog(id: number): Promise<AgentCallLogItem> {
    return request(`/agent/call-logs/${id}`);
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
  // Java 后端分页查询参数为 page(0-based)/size；响应里分页大小字段为 per_page。
  getNotifications(page = 1, perPage = 20): Promise<NotificationListResponse> {
    return request(`/notifications?page=${page - 1}&size=${perPage}`);
  },
  getUnreadCount(): Promise<{ count: number }> {
    return request('/notifications/unread-count');
  },
  markNotificationsRead(ids?: number[]): Promise<{ status: string }> {
    if (ids && ids.length > 0) {
      // Mark single notification as read — only the first id
      return request(`/notifications/${ids[0]}/read`, { method: 'PUT' });
    }
    // Mark all as read
    return request('/notifications/read-all', { method: 'PUT' });
  },

  // ---- Candidate pipeline context / journey / reassignment (M4/M5) ----
  getCandidatePipelines(candidateId: number): Promise<CandidatePipelines> {
    return request(`/candidates/${candidateId}/pipelines`);
  },
  getCandidateJourney(candidateId: number, jobId: number): Promise<CandidateJourney> {
    return request(`/candidates/${candidateId}/journey?jobId=${jobId}`);
  },
  reassignCandidate(
    candidateId: number,
    ownerHrId: number,
    reason: string,
  ): Promise<{ candidateId: number; ownerHrId: number; reason: string }> {
    return request(`/candidates/${candidateId}/owner`, {
      method: 'PATCH',
      body: { ownerHrId, reason },
    });
  },

  // ---- BOSS 直聘集成（boss-cli 招聘端）----
  // 后端统一返回 {ok, data}；bossRequest 解包 data。错误以 ApiError 抛出。
  bossStatus(): Promise<BossStatus> {
    return bossRequest('/boss/status');
  },
  bossJobs(): Promise<BossJob[]> {
    return bossRequest('/boss/jobs');
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

  // ---- 招聘闭环：批量导入 / AI 初筛 ----
  // 批量下载并导入收件箱候选人简历到候选人库（限量+间隔+去重）。
  bossBatchImport(params: BossBatchImportParams): Promise<BossBatchImportResult> {
    return bossRequest('/boss/batch-import', { method: 'POST', body: params });
  },
  // 对已导入候选人做 AI 简历初筛（LLM 评估 + 写 Interview + 推进 ai_screen）。
  bossAiScreen(params: BossAiScreenParams): Promise<BossAiScreenResult> {
    return bossRequest('/boss/ai-screen', { method: 'POST', body: params });
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

  // ---- BOSS 账号管理 ----
  // 从浏览器粘贴 Cookie 导入（招聘端 Web API 需要浏览器 cookie，QR 扫码无效）。
  bossImportBrowserCookie(cookies: string, label = ''): Promise<BossAccount> {
    return bossRequest('/boss/browser-cookie', { method: 'POST', body: { cookies, label } });
  },
  // 浏览器扩展下载走专用 URL（返回 ZIP），window.open 触发。
  bossExtensionDownloadUrl(): string {
    const qs = new URLSearchParams();
    const token = getToken();
    if (token) qs.set('token', token);
    return `${API_BASE}/boss/extension/download?${qs}`;
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

  // ---- BOSS CLI 高级功能 ----
  // 候选人标签列表
  bossLabels(): Promise<unknown> {
    return bossRequest('/boss/labels');
  },
  // 聊天记录（Java 端为 POST /boss/chat，body 传 friendId）
  bossChat(friendId: string): Promise<unknown> {
    return bossRequest('/boss/chat', { method: 'POST', body: { friendId } });
  },
  // 导出候选人列表
  bossExport(): Promise<unknown> {
    return bossRequest('/boss/export');
  },
};
