// Shared domain types for the HireInsight frontend.
// Mirrors the Flask backend API contract (base path: /api).

export type Role = 'recruiter' | 'manager' | 'admin' | 'interviewer';

export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'interview_first'
  | 'interview_second'
  | 'interview_final'
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
  // Optional HR answers to AI clarification questions, folded into the JD.
  clarifications?: JdClarificationAnswer[];
}

// A single AI clarification question about a JD.
export interface JdClarificationQuestion {
  field: string;
  question: string;
  placeholder?: string;
}

// HR's answer to one clarification question.
export interface JdClarificationAnswer {
  question: string;
  answer: string;
}

export interface JdClarifyResponse {
  questions: JdClarificationQuestion[];
  warning?: string;
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

// Full job detail incl. structured JD and lifecycle status.
export interface JobDetail {
  id: number;
  title: string;
  jd_text: string;
  structured: JobStructured;
  status: string;
  owner_hr_id?: number;
  created_at?: string;
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
  note?: string;
}

export interface PipelineMoveResponse {
  status: string;
  stage: PipelineStage;
  from: PipelineStage | null;
  candidate_id: number;
  name_masked: string;
}

// Map of stage -> count. Keys are PipelineStage values.
export type PipelineCounts = Partial<Record<PipelineStage, number>>;

// A single candidate currently sitting in a job's pipeline (at their latest stage).
export interface PipelineBoardCandidate {
  candidate_id: number;
  name_masked: string;
  stage: PipelineStage;
  updated_at: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

// Full board payload for one job: candidates bucketed by their current stage.
export interface PipelineBoard {
  job_id: number;
  job_title: string;
  stage_order: PipelineStage[];
  candidates: PipelineBoardCandidate[];
}

// One step in a candidate's stage-transition timeline for a job.
export interface PipelineHistoryStep {
  stage: PipelineStage;
  ts: string | null;
  updated_by_name: string | null;
  note?: string | null;
}

export interface PipelineHistory {
  job_id: number;
  candidate_id: number;
  timeline: PipelineHistoryStep[];
}

// ---- BI ----
// 漏斗按当前阶段计数。面试阶段已拆分为三轮（一面/二面/终面），
// BI 漏斗展示时合并为一个"面试"概念值（见 BiPage 的 interviewTotal）。
export interface BiFunnel {
  pending?: number;
  ai_screen?: number;
  interview_first?: number;
  interview_second?: number;
  interview_final?: number;
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

// Single-job funnel detail.
export interface BiJobDetail {
  job_id: number;
  job_title: string;
  funnel: BiFunnel;
}

// ---- Account ----
export interface MeResponse {
  id: number;
  name: string;
  email: string;
  role: Role;
}

// ---- Admin user management ----
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string | null;
}

// ---- Interview list + feedback ----
export interface InterviewListItem {
  id: number;
  type: 'ai' | 'feedback';
  candidate_id: number;
  name_masked: string | null;
  job_id: number;
  job_title: string | null;
  score: number | null;
  pass: boolean | null;
  round: string | null;
  created_at: string | null;
}

export interface InterviewFeedbackInput {
  candidate_id: number;
  job_id: number;
  round: PipelineStage;
  score: number;
  passed: boolean;
  strengths?: string;
  concerns?: string;
  note?: string;
}
