// Typed API client for the HireInsight backend.
// All requests are prefixed with /api (proxied to the Flask server in dev).
// The JWT is read from localStorage and injected as a Bearer token.

import type {
  BiOverview,
  BiStaffDetail,
  BiJobDetail,
  CandidateDetail,
  CandidateListItem,
  CreateJobRequest,
  CreateJobResponse,
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
  PipelineBoard,
  PipelineHistory,
  PipelineCounts,
  PipelineMoveRequest,
  PipelineMoveResponse,
  RegisterRequest,
  RegisterResponse,
  ResumeUploadResponse,
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
    const message =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : null) ||
      (data && typeof data === 'object' && 'message' in data
        ? String((data as Record<string, unknown>).message)
        : null) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
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
  uploadResumes(files: File[]): Promise<ResumeUploadResponse> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return request('/resume/upload', { method: 'POST', formData: form });
  },
  getCandidate(candidateId: number): Promise<CandidateDetail> {
    return request(`/resume/${candidateId}`);
  },
  listCandidates(): Promise<CandidateListItem[]> {
    return request('/candidates');
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
  // Edit a job's title / JD (JD change re-runs structuring server-side).
  updateJob(jobId: number, payload: { title?: string; jd_text?: string }): Promise<JobDetail> {
    return request(`/jobs/${jobId}`, { method: 'PUT', body: payload });
  },
  // Close (take offline) a job — soft close, status=closed.
  closeJob(jobId: number): Promise<{ id: number; status: string }> {
    return request(`/jobs/${jobId}/close`, { method: 'POST' });
  },
  listJobs(): Promise<JobListItem[]> {
    return request('/jobs');
  },
  // CANONICAL match endpoint — feature pages (F3 job-to-candidate match) should
  // use this RESTful, job-scoped method.
  matchJob(jobId: number): Promise<MatchResponse> {
    return request(`/jobs/${jobId}/match`, { method: 'POST' });
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
};
