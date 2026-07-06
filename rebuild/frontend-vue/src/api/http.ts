import type { ResumeUploadResponse, ResumeUploadResult, ResumeUploadTaskResponse } from '@/types/api'
import type { InterviewDetailItem } from '@/types'
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

const BASE = import.meta.env.VITE_API_BASE_URL || '/api'

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
  return JSON.parse(text) as T
}

function unwrapData<T>(payload: T | { data?: T } | null | undefined): T | null {
  if (!payload) return null
  if (typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data as T
  }
  return payload as T
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
  getMe: () =>
    request<{ id: number; name: string; email: string; role: string }>('/auth/me'),
  listCandidates: () =>
    request<{ id: number; name_masked: string; parse_status: string }[]>('/candidates'),
  listJobs: (status?: string) =>
    request<{ id: number; title: string; status: string }[]>(
      `/jobs${status ? `?status=${status}` : ''}`
    ),
  getPipelineBoard: (jobId: number) =>
    request<{ job_id: number; stages: Record<string, unknown[]> }>(
      `/pipeline/${jobId}/board`
    ),

  getInterview: (id: number) =>
    request<InterviewDetailItem>(`/api/v1/interviews/${id}`),
  listInterviews: () =>
    request<{ id: number; candidate_name: string; job_title: string; status: string; score: number | null }[]>(
      '/interviews'
    ),
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
