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

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const init: RequestInit = { method: opts.method || 'GET', headers }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
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
  listInterviews: () =>
    request<{ id: number; candidate_name: string; job_title: string; status: string; score: number | null }[]>(
      '/interviews'
    ),
}
