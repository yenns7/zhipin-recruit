import type {
  AgentConversationDetailResponse,
  AgentConversationListResponse,
  AgentSendMessageResponse,
  AuthLogoutResponse,
  CandidateListItem,
  CandidateListQuery,
  DashboardStatsResponse,
  InterviewDetailItem,
  InterviewListItem,
  InterviewListQuery,
  JobListItem,
  JobListQuery,
  NotificationTodoMutationResponse,
  NotificationTodoResponse,
  PaginatedResponse,
  PipelineBoardCandidate,
  PipelineBoardResponse,
  PipelineCorrectionResponse,
  PipelineHistoryResponse,
  PipelineMovePayload,
  PipelineMoveResponse,
  PipelineRevisePayload,
  PipelineReviseResponse,
  InterviewSchedulePayload,
  InterviewScheduleResponse,
  ResumeUploadResponse,
  ResumeUploadResult,
  ResumeUploadTaskResponse,
  RollbackPreview,
  SystemAuditLogResponse,
  SystemGovernanceMutationResponse,
  SystemOverviewResponse,
  UserPasswordChangeResponse,
} from '@/types/api'
import type {
  TalentMap, TalentMapSummary, TalentMapInput,
  TalentMapCompany, TalentMapCompanyInput,
  TalentMapPerson, TalentMapPersonInput, TalentMapFilters,
} from '@/types/api'

const TOKEN_KEY = 'hireinsight_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function isApiEnvelope(payload: unknown): payload is { code: number; message: string; data?: unknown } {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      'message' in payload &&
      'data' in payload
  )
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const init: RequestInit = { method: opts.method || 'GET', headers }
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) {
      init.body = opts.body
    } else {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(opts.body)
    }
  }
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler()
    }
    const text = await res.text()
    let msg = `请求失败 (${res.status})`
    try {
      const json = JSON.parse(text)
      msg = json.error || json.message || msg
    } catch {}
    throw new ApiError(res.status, msg)
  }
  const text = await res.text()
  if (!text) return null as T
  const payload = JSON.parse(text) as unknown
  return (isApiEnvelope(payload) ? payload.data : payload) as T
}

function unwrapData<T>(payload: T | { data?: T } | null | undefined): T | null {
  if (!payload) return null
  if (typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T
  }
  return payload as T
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function buildPath(path: string, params: Record<string, string | number | undefined | null> = {}): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') {
      query.set(key, String(value))
    }
  })
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

function normalizeCandidate(raw: unknown): CandidateListItem {
  const record = asRecord(raw) ?? {}
  return {
    id: numberValue(record.id),
    name_masked: stringValue(record.name_masked ?? record.nameMasked, '未知候选人'),
    parse_status: stringValue(record.parse_status ?? record.parseStatus, 'parsed'),
    created_at: nullableString(record.created_at ?? record.createdAt),
  }
}

function normalizeJob(raw: unknown): JobListItem {
  const record = asRecord(raw) ?? {}
  return {
    id: numberValue(record.id),
    title: stringValue(record.title, '未命名岗位'),
    status: stringValue(record.status, 'active'),
    created_at: nullableString(record.created_at ?? record.createdAt),
  }
}

function normalizeInterview(raw: unknown): InterviewListItem {
  const record = asRecord(raw) ?? {}
  return {
    id: numberValue(record.id),
    candidate_name: stringValue(record.candidate_name ?? record.candidateName, '候选人'),
    job_title: stringValue(record.job_title ?? record.jobTitle, '岗位'),
    status: stringValue(record.status, record.score === null ? 'draft' : 'completed'),
    score: typeof record.score === 'number' ? record.score : null,
    created_at: nullableString(record.created_at ?? record.createdAt),
  }
}

function normalizePipelineCandidate(raw: unknown): PipelineBoardCandidate {
  const record = asRecord(raw) ?? {}
  return {
    candidate_id: numberValue(record.candidate_id ?? record.candidateId),
    candidate_name: stringValue(record.candidate_name ?? record.candidateName, '候选人'),
    stage: stringValue(record.stage, 'pending'),
    updated_at: nullableString(record.updated_at ?? record.updatedAt ?? record.ts),
  }
}

function normalizePage<T>(
  payload: unknown,
  itemKeys: string[],
  normalize: (raw: unknown) => T,
  fallbackPage: number,
  fallbackPageSize: number,
): PaginatedResponse<T> {
  const unwrapped = unwrapData(payload as { data?: unknown }) as unknown
  if (Array.isArray(unwrapped)) {
    const start = (fallbackPage - 1) * fallbackPageSize
    return {
      items: unwrapped.slice(start, start + fallbackPageSize).map(normalize),
      total: unwrapped.length,
      page: fallbackPage,
      pageSize: fallbackPageSize,
    }
  }

  const record = asRecord(unwrapped) ?? {}
  const rawItems = itemKeys
    .map(key => record[key])
    .find(Array.isArray) as unknown[] | undefined
  const items = (rawItems ?? []).map(normalize)
  return {
    items,
    total: numberValue(record.total, items.length),
    page: numberValue(record.page, fallbackPage),
    pageSize: numberValue(record.pageSize, fallbackPageSize),
  }
}

function normalizeDashboardStats(payload: unknown): DashboardStatsResponse {
  const record = asRecord(unwrapData(payload as { data?: unknown })) ?? {}
  const summary = Array.isArray(record.summary) ? record.summary : []
  const metricValue = (key: string) => {
    const match = summary.find(item => asRecord(item)?.key === key)
    return numberValue(asRecord(match)?.value)
  }
  return {
    activeJobs: numberValue(record.activeJobs, metricValue('active_jobs')),
    candidateTotal: numberValue(record.candidateTotal, metricValue('candidate_total')),
    parsedCandidates: numberValue(record.parsedCandidates, metricValue('parsed_candidates')),
    adminOrManager: Boolean(record.adminOrManager),
  }
}

function normalizeResumeStatus(status?: string): ResumeUploadResult['status'] {
  switch ((status || '').toUpperCase()) {
    case 'PENDING':
      return 'PENDING'
    case 'PROCESSING':
      return 'PROCESSING'
    case 'PARSED':
    case 'OK':
      return 'PARSED'
    case 'FAILED':
    case 'ERROR':
      return 'FAILED'
    case 'SKIPPED':
      return 'skipped'
    default:
      return 'FAILED'
  }
}

function normalizeResumeUploadResult(raw: Record<string, unknown>): ResumeUploadResult {
  return {
    file: String(raw.file ?? raw.filename ?? ''),
    status: normalizeResumeStatus(typeof raw.status === 'string' ? raw.status : undefined),
    task_id: raw.task_id != null ? String(raw.task_id) : raw.taskId != null ? String(raw.taskId) : undefined,
    candidate_id:
      typeof raw.candidate_id === 'number'
        ? raw.candidate_id
        : typeof raw.candidateId === 'number'
          ? raw.candidateId
          : undefined,
    reason: typeof raw.reason === 'string' ? raw.reason : typeof raw.message === 'string' ? raw.message : undefined,
    target_job_id: typeof raw.target_job_id === 'number' ? raw.target_job_id : undefined,
    pipeline_stage: typeof raw.pipeline_stage === 'string' ? raw.pipeline_stage : undefined,
  }
}

function normalizeResumeUploadResponse(rawPayload: unknown): ResumeUploadResponse {
  const payload = unwrapData(rawPayload as { data?: unknown }) as Record<string, unknown> | null
  const rawResults = Array.isArray(payload?.results)
    ? payload?.results
    : Array.isArray(payload?.tasks)
      ? payload?.tasks.map(task =>
          typeof task === 'object' && task
            ? { ...(task as Record<string, unknown>), status: (task as Record<string, unknown>).status ?? 'PENDING' }
            : task,
        )
      : []

  const results = rawResults
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(normalizeResumeUploadResult)

  return {
    batch_id:
      typeof payload?.batch_id === 'number'
        ? payload.batch_id
        : typeof payload?.batchId === 'number'
          ? payload.batchId
          : undefined,
    total:
      typeof payload?.total === 'number'
        ? payload.total
        : typeof payload?.queued === 'number'
          ? payload.queued
          : results.length,
    results,
  }
}

export const api = {
  login: (payload: { email: string; password: string }) =>
    request<{ token: string; role: string; name: string }>('/auth/login', {
      method: 'POST',
      body: payload,
    }),
  logout: () =>
    request<AuthLogoutResponse>('/auth/logout', {
      method: 'POST',
    }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<UserPasswordChangeResponse>('/users/me/password', {
      method: 'PUT',
      body: payload,
    }),
  getMe: () =>
    request<{ id: number; name: string; email: string; role: string }>('/users/me'),
  getDashboardStats: async () => {
    const payload = await request<unknown>('/bi/overview')
    return normalizeDashboardStats(payload)
  },
  listCandidates: async (params: CandidateListQuery = {}) => {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 10
    const payload = await request<unknown>(buildPath('/candidates', { page, pageSize }))
    return normalizePage(payload, ['candidates', 'items'], normalizeCandidate, page, pageSize)
  },
  listJobs: async (params: JobListQuery = {}) => {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 10
    const payload = await request<unknown>(buildPath('/jobs', { page, pageSize, status: params.status }))
    return normalizePage(payload, ['jobs', 'items'], normalizeJob, page, pageSize)
  },
  getPipelineBoard: async (jobId: number): Promise<PipelineBoardResponse> => {
    const payload = await request<unknown>(`/pipeline/${jobId}/board`)
    const record = asRecord(unwrapData(payload as { data?: unknown })) ?? {}
    const rawStages = asRecord(record.stages) ?? {}
    const stages = Object.fromEntries(
      Object.entries(rawStages).map(([stage, items]) => [
        stage,
        Array.isArray(items) ? items.map(normalizePipelineCandidate) : [],
      ]),
    )
    return {
      job_id: numberValue(record.job_id ?? record.jobId, jobId),
      stages,
    }
  },
  getPipelineHistory: (jobId: number, candidateId: number) =>
    request<PipelineHistoryResponse>(`/pipeline/${jobId}/candidates/${candidateId}/history`),
  movePipeline: (payload: PipelineMovePayload) =>
    request<PipelineMoveResponse>('/pipeline/move', {
      method: 'POST',
      body: payload,
    }),
  revisePipeline: (payload: PipelineRevisePayload) =>
    request<PipelineReviseResponse>('/pipeline/revise', {
      method: 'POST',
      body: payload,
    }),
  previewPipelineRollback: (jobId: number, candidateId: number) =>
    request<RollbackPreview>(`/pipeline/${jobId}/candidates/${candidateId}/rollback-preview`),
  rollbackPipeline: (jobId: number, candidateId: number) =>
    request<PipelineCorrectionResponse>(`/pipeline/${jobId}/candidates/${candidateId}/rollback`, {
      method: 'POST',
    }),

  getInterview: (id: number) =>
    request<InterviewDetailItem>(`/interviews/${id}`),
  scheduleInterview: (payload: InterviewSchedulePayload) =>
    request<InterviewScheduleResponse>('/interviews/schedule', {
      method: 'POST',
      body: payload,
    }),
  listInterviews: async (params: InterviewListQuery = {}) => {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 10
    const payload = await request<unknown>(buildPath('/interviews', { page, pageSize }))
    return normalizePage(payload, ['interviews', 'items'], normalizeInterview, page, pageSize)
  },
  uploadResumes: async (files: File[]): Promise<ResumeUploadResponse> => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    const payload = await request<unknown>('/resumes/upload', {
      method: 'POST',
      body: formData,
    })
    return normalizeResumeUploadResponse(payload)
  },
  getResumeUploadTask: async (taskId: string): Promise<ResumeUploadTaskResponse> => {
    const payload = await request<unknown>(`/resumes/tasks/${taskId}`)
    const raw = unwrapData(payload as { data?: unknown }) as Record<string, unknown> | null
    return normalizeResumeUploadResult(raw ?? { file: '', status: 'FAILED' })
  },

  getNotificationTodos: () =>
    request<NotificationTodoResponse>('/notifications/todos'),

  completeNotificationTodo: (todoId: string) =>
    request<NotificationTodoMutationResponse>(`/notifications/todos/${todoId}/complete`, {
      method: 'POST',
    }),

  archiveNotificationTodo: (todoId: string) =>
    request<NotificationTodoMutationResponse>(`/notifications/todos/${todoId}/archive`, {
      method: 'POST',
    }),

  getSystemOverview: () =>
    request<SystemOverviewResponse>('/admin/system/overview'),

  getSystemAuditLogs: () =>
    request<SystemAuditLogResponse>('/admin/system/audit-logs'),

  toggleSystemParameter: (key: string) =>
    request<SystemGovernanceMutationResponse>(`/admin/system/parameters/${key}/toggle`, {
      method: 'POST',
    }),

  toggleSystemModelStatus: (modelId: string) =>
    request<SystemGovernanceMutationResponse>(`/admin/system/models/${modelId}/toggle-status`, {
      method: 'POST',
    }),

  listAgentConversations: () =>
    request<AgentConversationListResponse>('/agent/conversations'),

  getAgentConversation: (conversationId: string) =>
    request<AgentConversationDetailResponse>(`/agent/conversations/${conversationId}`),

  sendAgentMessage: (conversationId: string, content: string) =>
    request<AgentSendMessageResponse>(`/agent/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content },
    }),

  // ---- Talent Map ----

  listTalentMaps: () =>
    request<TalentMapSummary[]>('/talent-maps'),

  createTalentMap: (payload: TalentMapInput) =>
    request<TalentMap>('/talent-maps', { method: 'POST', body: payload }),

  getTalentMap: (mapId: number, filters: TalentMapFilters = {}) => {
    const search = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value))
      }
    })
    const suffix = search.toString() ? `?${search.toString()}` : ''
    return request<TalentMap>(`/talent-maps/${mapId}${suffix}`)
  },

  updateTalentMap: (mapId: number, payload: Partial<TalentMapInput>) =>
    request<TalentMap>(`/talent-maps/${mapId}`, { method: 'PATCH', body: payload }),

  createTalentMapCompany: (mapId: number, payload: TalentMapCompanyInput) =>
    request<TalentMapCompany>(`/talent-maps/${mapId}/companies`, { method: 'POST', body: payload }),

  createTalentMapPerson: (mapId: number, payload: TalentMapPersonInput) =>
    request<TalentMapPerson>(`/talent-maps/${mapId}/people`, { method: 'POST', body: payload }),

  updateTalentMapPerson: (personId: number, payload: Partial<TalentMapPersonInput>) =>
    request<TalentMapPerson>(`/talent-map-people/${personId}`, { method: 'PATCH', body: payload }),
}
