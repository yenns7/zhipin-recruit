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
  batch_id?: number;
  total: number;
  results: ResumeUploadResultItem[];
}

export interface CandidateTag {
  tag: string;
  score: number;
}

// Resume JSON is backend-defined and free-form; kept as a record.
export type ResumeJson = Record<string, unknown>;

export interface CandidateSourceInfo {
  batch_id: number;
  channel: string;
  source_link: string;
  referrer: string;
  target_job_id: number | null;
  target_job_title: string | null;
  note: string;
  created_at: string | null;
}

export interface CandidateDetail {
  id: number;
  name_masked: string;
  resume_json: ResumeJson;
  tags: CandidateTag[];
  source?: CandidateSourceInfo | null;
  created_at: string;
}

export interface CandidateListItem {
  id: number;
  name_masked: string;
  email_masked?: string;
  phone_masked?: string;
  owner_hr_id: number;
  created_at: string;
  tag_count: number;
  top_tags?: CandidateTag[];
  max_score?: number;
  latest_experience?: {
    company: string;
    position: string;
    duration: string;
  } | null;
  education_summary?: string;
  source?: CandidateSourceInfo | null;
}

export interface CandidateListQuery {
  search?: string;
  stage?: PipelineStage;
  job_id?: number;
  sort_by?: 'created_at' | 'name_masked';
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface CandidateListResponse {
  candidates: CandidateListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// ---- Jobs ----
export interface CreateJobRequest {
  title: string;
  jd_text: string;
  city?: string;
  department?: string;
  job_code?: string;
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
  city: string;
  department: string;
  job_code: string;
  structured: JobStructured;
}

export interface JobListItem {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
  created_at: string;
}

// Full job detail incl. structured JD and lifecycle status.
export interface JobDetail {
  id: number;
  title: string;
  city: string;
  department: string;
  job_code: string;
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
  disposition?: CandidateDispositionInput;
}

export interface PipelineMoveResponse {
  status: string;
  stage: PipelineStage;
  from: PipelineStage | null;
  candidate_id: number;
  name_masked: string;
}

export interface CandidateDispositionInput {
  reason?: string;
  enter_talent_pool?: boolean;
  next_contact_at?: string;
  tags?: string[];
  note?: string;
}

export interface OfferRecord {
  id?: number;
  candidate_id: number;
  job_id: number;
  salary_range: string;
  onboard_date: string | null;
  approval_status: 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'declined' | string;
  note: string;
  updated_at?: string | null;
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

// ---- Admin AI architecture dashboard ----
export interface AdminAiTool {
  name: string;
  description: string;
  params: Record<string, string>;
  rbac?: Role[];
  write?: boolean;
}

export interface AdminAiArchitectureLayer {
  name: string;
  description: string;
  files: string[];
}

export interface AdminAiPermissionModel {
  database_access: boolean;
  read_tools_available_to_authenticated_users: boolean;
  read_scope_note: string;
  write_requires_confirmation: boolean;
  write_scope_note: string;
  cannot_do: string[];
}

export interface AdminAiArchitecture {
  title: string;
  purpose: string;
  system_prompt: string;
  read_tools: AdminAiTool[];
  write_tools: AdminAiTool[];
  architecture: AdminAiArchitectureLayer[];
  permission_model: AdminAiPermissionModel;
  safeguards: string[];
  recommended_next_steps: string[];
}

export interface AuditLogItem {
  id: number;
  source: 'event';
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  payload: Record<string, unknown>;
  ts: string | null;
}

export interface AuditLogResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface AuditLogQuery {
  page?: number;
  per_page?: number;
  actor_id?: number;
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  unread_count: number;
}

export interface InterviewerOption {
  id: number;
  name: string;
  role: Role;
}

export interface InterviewAssignment {
  id: number;
  candidate_id: number;
  name_masked: string | null;
  job_id: number;
  job_title: string | null;
  round: PipelineStage;
  interviewer_id: number;
  interviewer_name: string | null;
  scheduled_at: string | null;
  location: string;
  note: string;
  status: string;
  feedback_submitted: boolean;
  is_overdue: boolean;
  created_by_name: string | null;
  created_at: string | null;
}

export interface InterviewAssignmentInput {
  candidate_id: number;
  job_id: number;
  round: PipelineStage;
  interviewer_id: number;
  scheduled_at?: string;
  location?: string;
  note?: string;
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
  interviewer_id: number | null;
  interviewer_name: string | null;
  evaluation: EvaluationScores | null;
  strengths: string | null;
  concerns: string | null;
  note: string | null;
  created_at: string | null;
}

export type EvaluationScores = Record<string, number>;

export interface InterviewFeedbackInput {
  candidate_id: number;
  job_id: number;
  round: PipelineStage;
  score: number;
  passed: boolean;
  evaluation?: EvaluationScores;
  strengths?: string;
  concerns?: string;
  note?: string;
}

export interface InterviewGuide {
  candidate_id: number;
  job_id: number;
  round: PipelineStage;
  focus: string[];
  questions: string[];
  risks: string[];
  required_checks: string[];
}

// ---- Candidate pipeline context / journey (M4/M5) ----
export interface CandidatePipelineItem {
  job_id: number;
  job_title: string;
  stage: PipelineStage;
  updated_at: string | null;
}

export interface CandidatePipelines {
  candidate_id: number;
  name_masked: string;
  pipelines: CandidatePipelineItem[];
}

export interface JourneyTimelineStep {
  stage: PipelineStage;
  ts: string | null;
  note: string | null;
  updated_by_name: string | null;
}

export interface JourneyAiInterview {
  id: number;
  score: number | null;
  pass: boolean | null;
  created_at: string | null;
}

export interface JourneyFeedback {
  id: number;
  round: string | null;
  score: number | null;
  passed: boolean | null;
  strengths: string | null;
  concerns: string | null;
  evaluation: EvaluationScores;
  note: string | null;
  interviewer_name: string | null;
  created_at: string | null;
}

export interface JourneyDisposition {
  id: number;
  reason: string;
  enter_talent_pool: boolean;
  next_contact_at: string | null;
  tags: string[];
  note: string;
  created_by_name: string | null;
  created_at: string | null;
}

export interface DecisionSummary {
  current_stage: PipelineStage | null;
  feedback_count: number;
  passed_count: number;
  failed_count: number;
  average_score: number | null;
  ai_interview_count: number;
  highlights: string[];
  risks: string[];
  recommendation: string;
}

export interface CandidateJourney {
  candidate_id: number;
  name_masked: string;
  job_id: number;
  job_title: string | null;
  timeline: JourneyTimelineStep[];
  ai_interviews: JourneyAiInterview[];
  feedback: JourneyFeedback[];
  dispositions: JourneyDisposition[];
  decision_summary: DecisionSummary;
}
