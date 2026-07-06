export type Role = 'recruiter' | 'manager' | 'admin' | 'interviewer'

export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  role: Role
  name: string
}

export interface MeResponse {
  id: number
  name: string
  email: string
  role: Role
}

export interface CandidateListItem {
  id: number
  name_masked: string
  owner_hr_id: number
  tags: { tag: string; score: number }[]
  parse_status: string
  created_at: string
}

export interface JobListItem {
  id: number
  title: string
  status: string
  owner_hr_id: number
  created_at: string
}

export interface InterviewListItem {
  id: number
  candidate_name: string
  job_title: string
  status: string
  score: number | null
  created_at: string
}

export interface PipelineBoardItem {
  candidate_id: number
  candidate_name: string
  stage: PipelineStage
  updated_at: string
}

export interface PipelineBoard {
  job_id: number
  stages: Record<PipelineStage, PipelineBoardItem[]>
}
