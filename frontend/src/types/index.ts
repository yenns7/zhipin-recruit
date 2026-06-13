// Shared domain types for the HireInsight frontend.
// Mirrors the Flask backend API contract (base path: /api).

export type Role = 'recruiter' | 'manager' | 'admin' | 'interviewer';

export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected';

// ---- Auth ----
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface RegisterResponse {
  id: number;
  email: string;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: Role;
  name: string;
}

// JWT payload (decoded client-side, not verified).
export interface JwtPayload {
  user_id: number;
  role: Role;
  exp: number;
}

// ---- Resume / Candidates ----
export interface ResumeUploadResultItem {
  file: string;
  status: 'ok' | 'skipped' | 'error';
  candidate_id?: number;
  reason?: string;
}

export interface ResumeUploadResponse {
  total: number;
  results: ResumeUploadResultItem[];
}

export interface CandidateTag {
  tag: string;
  score: number;
}

// Resume JSON is backend-defined and free-form; kept as a record.
export type ResumeJson = Record<string, unknown>;

export interface CandidateDetail {
  id: number;
  name_masked: string;
  resume_json: ResumeJson;
  tags: CandidateTag[];
  created_at: string;
}

export interface CandidateListItem {
  id: number;
  name_masked: string;
  owner_hr_id: number;
  created_at: string;
  tag_count: number;
}

// ---- Jobs ----
export interface CreateJobRequest {
  title: string;
  jd_text: string;
}

export type JobStructured = Record<string, unknown>;

export interface CreateJobResponse {
  id: number;
  title: string;
  structured: JobStructured;
}

export interface JobListItem {
  id: number;
  title: string;
  created_at: string;
}

// ---- Matching ----
export interface MatchResultItem {
  candidate_id: number;
  name_masked: string;
  score: number;
  matched_tags: string[];
  missing_tags: string[];
}

export interface MatchResponse {
  job_id: number;
  results: MatchResultItem[];
}

// ---- Interview ----
export interface InterviewStartRequest {
  candidate_id: number;
  job_id: number;
  count?: number;
}

export interface InterviewStartResponse {
  candidate_id: number;
  job_id: number;
  questions: string[];
}

export interface QaPair {
  q: string;
  a: string;
}

export interface InterviewSubmitRequest {
  candidate_id: number;
  job_id: number;
  qa_pairs: QaPair[];
}

export interface InterviewReportDetail {
  score: number;
  highlight: string;
  concern: string;
  pass_recommended: boolean;
}

export interface InterviewReport {
  avg_score: number;
  pass_recommended: boolean;
  details: InterviewReportDetail[];
}

export interface InterviewSubmitResponse {
  interview_id: number;
  report: InterviewReport;
}

export interface InterviewRecord {
  id: number;
  candidate_id: number;
  job_id: number;
  score: number;
  pass_recommended: boolean;
  ai_report: InterviewReport;
  created_at: string;
}

// ---- Pipeline ----
export interface PipelineMoveRequest {
  candidate_id: number;
  job_id: number;
  stage: PipelineStage;
}

export interface PipelineMoveResponse {
  status: string;
  stage: PipelineStage;
}

// Map of stage -> count. Keys are PipelineStage values.
export type PipelineCounts = Partial<Record<PipelineStage, number>>;

// ---- BI ----
export interface BiFunnel {
  pending?: number;
  ai_screen?: number;
  interview?: number;
  offer?: number;
  onboarded?: number;
  rejected?: number;
  conversion_rate: number;
}

export interface BiStaffMember {
  hr_id: number;
  name: string;
  resumes: number;
  screens: number;
  onboarded: number;
  conversion_rate: number;
}

export interface BiOverview {
  funnel: BiFunnel;
  staff: BiStaffMember[];
}

export interface BiStaffDetail {
  hr_id: number;
  funnel: BiFunnel;
}
