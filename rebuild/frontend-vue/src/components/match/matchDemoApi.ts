const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function getToken(): string | null {
  return localStorage.getItem('hireinsight_token')
}

async function request<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`)
  }

  const payload = await response.json()
  return payload.data as T
}

export interface MatchJobOption {
  id: number
  title: string
  status: string
  targetCandidateCount: number
}

export interface MatchCandidateOption {
  id: number
  name: string
  currentStage: string
}

export interface MatchRecommendationCard {
  id: number
  title: string
  subtitle: string
  score: number
  reasons: string[]
  nextAction: string
}

export interface JobRecommendationResponse {
  job: MatchJobOption
  recommendations: Array<{
    candidateId: number
    candidateName: string
    currentStage: string
    score: number
    reasons: string[]
    nextAction: string
  }>
  generatedAt: string
}

export interface CandidateRecommendationResponse {
  candidate: MatchCandidateOption
  recommendations: Array<{
    jobId: number
    jobTitle: string
    status: string
    score: number
    reasons: string[]
    nextAction: string
  }>
  generatedAt: string
}

export function listMatchJobs() {
  return request<{ items: MatchJobOption[] }>('/match/jobs')
}

export function getJobRecommendations(jobId: number) {
  return request<JobRecommendationResponse>(`/match/jobs/${jobId}/candidates`)
}

export function listMatchCandidates() {
  return request<{ items: MatchCandidateOption[] }>('/match/candidates')
}

export function getCandidateRecommendations(candidateId: number) {
  return request<CandidateRecommendationResponse>(`/match/candidates/${candidateId}/jobs`)
}
