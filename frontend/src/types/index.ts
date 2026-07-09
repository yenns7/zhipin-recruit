// Shared domain types for the HireInsight frontend.
// Mirrors the Java Spring Boot backend API contract (base path: /api/v1).
// Field names use camelCase to match Jackson's default serialization.
// Exceptions: Notification & Disposition response Maps keep snake_case keys
// (hand-written on the Java side). BOSS responses follow boss-cli's shape.

export type Role = 'recruiter' | 'manager' | 'admin' | 'interviewer';

export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'business_review'
  | 'interview'
  | 'offer'
  | 'onboarded'
  | 'rejected';

export type InterviewRound =
  | 'round_1'
  | 'round_2'
  | 'round_3'
  | 'additional'
  | 'hr'
  | 'business'
  | 'technical'
  | 'interview_first'
  | 'interview_second'
  | 'interview_final';

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
  userId: number;
  role: Role;
  exp: number;
}

// ---- Resume / Candidates ----
export interface ResumeUploadResultItem {
  file: string;
  status: 'ok' | 'skipped' | 'error';
  candidateId?: number;
  reason?: string;
}

export interface ResumeUploadResponse {
  batchId?: number;
  results: ResumeUploadResultItem[];
}

export interface CandidateTag {
  tag: string;
  score: number;
}

// Resume JSON is backend-defined and free-form; kept as a record.
export type ResumeJson = Record<string, unknown>;
export type ParseStatus = 'pending' | 'processing' | 'ok' | 'failed';

export interface CandidateDetail {
  id: number;
  ownerHrId: number;
  nameMasked: string;
  emailMasked?: string;
  phoneMasked?: string;
  resumeJson: ResumeJson;
  rawFilePath?: string;
  parseStatus?: ParseStatus;
  batchId?: number;
  parseError?: string | null;
  tags?: CandidateTag[];
  createdAt: string;
}

export interface CandidateProfileUpdateRequest {
  profile: ResumeJson;
  skills?: CandidateTag[];
}

export interface RetryParseResponse {
  candidateId: number;
  parseStatus: ParseStatus;
}

export interface CandidateListItem {
  id: number;
  ownerHrId: number;
  nameMasked: string;
  emailMasked?: string;
  phoneMasked?: string;
  resumeJson?: ResumeJson;
  rawFilePath?: string;
  parseStatus?: ParseStatus;
  batchId?: number;
  parseError?: string | null;
  tags?: CandidateTag[];
  createdAt: string;
  // Deprecated legacy fields — kept for existing candidate library consumers.
  topTags?: CandidateTag[];
  tagCount?: number;
  maxScore?: number;
  intentCity?: string;
  latestExperience?: { company: string; position: string; duration: string } | null;
  educationSummary?: string;
  source?: Record<string, unknown> | null;
}

export interface CandidateListQuery {
  search?: string;
  stage?: PipelineStage;
  jobId?: number;
  city?: string;
  sourceChannel?: string;
  parseStatus?: ParseStatus;
  pipelineStatus?: string;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  perPage?: number;
}

// NOTE: Java GET /candidates returns a bare array (no pagination envelope).
// listCandidates() returns CandidateListItem[] directly. This response type is
// kept for the legacy searchCandidates() path which may return a paginated object.
export interface CandidateListResponse {
  candidates: CandidateListItem[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface CandidateOwnerOption {
  id: number;
  name: string;
  email: string;
}

// ---- Jobs ----
export interface CreateJobRequest {
  title: string;
  jdText: string;
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
  // Deprecated legacy fields
  title?: string;
  city?: string;
  department?: string;
  jobCode?: string;
  status?: string;
  structured?: JobStructured;
}

export interface JobListItem {
  id: number;
  title: string;
  jdText: string;
  ownerHrId: number;
  status: 'active' | 'closed' | string;
  createdAt: string;
  // Deprecated legacy fields
  city?: string;
  department?: string;
  jobCode?: string;
}

// Full job detail incl. structured JD and lifecycle status.
export interface JobDetail {
  id: number;
  title: string;
  jdText: string;
  jdStructured: JobStructured;
  ownerHrId: number;
  status: string;
  createdAt: string;
  // Deprecated legacy fields
  city?: string;
  department?: string;
  jobCode?: string;
  structured?: JobStructured;
}

// ---- Recruitment demands ----
export type DemandPriority = 'A' | 'B' | 'C';
export type DemandStatus = 'pending' | 'active' | 'paused' | 'filled' | 'cancelled';

export interface RecruitmentDemandMetrics {
  recommendedCount: number;
  businessReviewCount: number;
  interviewCount: number;
  offerCount: number;
  onboardedCount: number;
  currentStageCounts: Partial<Record<PipelineStage | string, number>>;
}

export interface RecruitmentDemand {
  id: number;
  jobId: number;
  jobTitle: string;
  jobCity: string;
  jobDepartment: string;
  jobCode: string;
  ownerHrId: number;
  requestNo: string;
  requesterName: string;
  requesterDepartment: string;
  hiringManagerName: string;
  requestedAt: string | null;
  acceptedAt: string | null;
  targetDate: string | null;
  priority: DemandPriority;
  headcount: number;
  status: DemandStatus;
  closeReason: string;
  downgradeReason: string;
  note: string;
  metrics: RecruitmentDemandMetrics;
  riskFlags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RecruitmentDemandInput {
  jobId: number;
  requestNo?: string;
  requesterName?: string;
  requesterDepartment?: string;
  hiringManagerName?: string;
  requestedAt?: string;
  acceptedAt?: string;
  targetDate?: string;
  priority?: DemandPriority;
  headcount?: number;
  status?: DemandStatus;
  note?: string;
}

export interface DemandCloseInput {
  status: 'filled' | 'cancelled' | 'paused';
  closeReason?: string;
}

export interface DemandDowngradeInput {
  priority: DemandPriority;
  downgradeReason?: string;
}

export interface DemandRestoreInput {
  note?: string;
}

// ---- Talent map ----
export type TalentMapBoardJson = Record<string, unknown>;

export interface TalentMapCompany {
  id: number;
  mapId: number;
  companyName: string;
  city: string;
  region: string;
  industry: string;
  priority: string;
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TalentMapPerson {
  id: number;
  mapId: number;
  companyId: number | null;
  companyName: string;
  name: string;
  title: string;
  city: string;
  tags: string[];
  salaryRange: string;
  contactStatus: string;
  evaluation: string;
  source: string;
  nextFollowAt: string | null;
  note: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TalentMapSummary {
  id: number;
  name: string;
  jobId: number | null;
  jobTitle: string;
  department: string;
  ownerHrId: number;
  companiesCount: number;
  peopleCount: number;
  updatedAt: string | null;
}

export interface TalentMap extends TalentMapSummary {
  boardJson: TalentMapBoardJson;
  companies: TalentMapCompany[];
  people: TalentMapPerson[];
  createdAt: string | null;
}

export interface TalentMapInput {
  name: string;
  jobId?: number | null;
  department?: string;
  boardJson?: TalentMapBoardJson;
}

export interface TalentMapCompanyInput {
  companyName: string;
  city?: string;
  region?: string;
  industry?: string;
  priority?: string;
  note?: string;
}

export interface TalentMapPersonInput {
  companyId?: number | null;
  name: string;
  title?: string;
  city?: string;
  tags?: string[];
  salaryRange?: string;
  contactStatus?: string;
  evaluation?: string;
  source?: string;
  nextFollowAt?: string;
  note?: string;
}

export interface TalentMapFilters {
  company?: string;
  city?: string;
  status?: string;
  keyword?: string;
}

// ---- Matching ----
export interface MatchResultItem {
  candidateId: number;
  candidateName: string;
  score: number;
  matchedRequiredSkills: string[];
  matchedPreferredSkills: string[];
  missingRequiredSkills: string[];
  yearsOfExperience: number | null;
  summary: string;
}

export interface MatchResponse {
  jobId: number;
  results: MatchResultItem[];
}

export interface BatchAddToPipelineResponse {
  jobId: number;
  added: number;
  skippedExisting: number;
  skippedMissing: number;
}

// ---- Interview ----
export interface InterviewStartRequest {
  candidateId: number;
  jobId: number;
}

export interface InterviewStartResponse {
  sessionId: number;
  session?: Record<string, unknown>;
  questions: string[];
}

// A single answered question in SubmitAnswersRequest.
export interface InterviewAnswer {
  questionId: string | number;
  question: string;
  answer: string;
}

export interface InterviewSubmitRequest {
  sessionId: number;
  answers: InterviewAnswer[];
}

export interface InterviewReportDetail {
  score: number;
  highlight: string;
  concern: string;
  passRecommended: boolean;
}

export interface InterviewReport {
  avgScore: number;
  passRecommended: boolean;
  details: InterviewReportDetail[];
}

export interface InterviewSubmitResponse {
  sessionId: number;
  score: number;
  report: InterviewReport;
}

export interface InterviewRecord {
  id: number;
  candidateId: number;
  jobId: number;
  score: number;
  passRecommended: boolean;
  aiReport: InterviewReport;
  createdAt: string;
}

// ---- Pipeline ----
export interface PipelineMoveRequest {
  candidateId: number;
  jobId: number;
  toStage: PipelineStage;
}

export interface PipelineMoveResponse {
  id: number;
  stage: PipelineStage;
}

// Disposition request body uses camelCase (aligns to Java CreateDispositionRequest).
export interface CandidateDispositionInput {
  reason?: string;
  intoPool?: boolean;
  nextContactAt?: string;
}

// Disposition *response* Map keys stay snake_case (Java hand-written Map).
export interface DispositionResponse {
  id: number;
  candidate_id: number;
  reason: string;
  into_pool: boolean;
  next_contact_at: string | null;
  created_at: string | null;
}

// Java OfferRecord entity: candidateId, jobId, salary, startDate, status, remark.
export interface OfferRecord {
  id?: number;
  candidateId: number;
  jobId: number;
  salary: string;
  startDate: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'draft' | 'sent' | 'accepted' | 'declined' | string;
  remark: string;
}

// Map of stage -> count. Keys are PipelineStage values.
export type PipelineCounts = Partial<Record<PipelineStage, number>>;

// A single candidate currently sitting in a job's pipeline (at their latest stage).
export interface PipelineBoardCandidate {
  candidateId: number;
  nameMasked: string;
  stage: PipelineStage;
  updatedAt: string | null;
  updatedByName: string | null;
  note?: string | null;
}

// Full board payload for one job: candidates bucketed by their current stage.
export interface PipelineBoard {
  jobId: number;
  jobTitle: string;
  stageOrder: PipelineStage[];
  candidates: PipelineBoardCandidate[];
}

// One step in a candidate's stage-transition timeline for a job.
export interface PipelineHistoryStep {
  stage: PipelineStage;
  ts: string | null;
  updatedByName: string | null;
  note?: string | null;
}

export interface PipelineHistory {
  jobId: number;
  candidateId: number;
  timeline: PipelineHistoryStep[];
}

// ---- BI ----
export interface BiSummaryItem {
  key: string;
  label: string;
  value: number;
  trend: number;
  trendDirection: 'up' | 'down' | 'flat';
}

export interface BiOverview {
  generatedAt: string;
  adminOrManager: string;
  parsedCandidates: number;
  candidateTotal: number;
  activeJobs: number;
  summary: BiSummaryItem[];
  // Legacy fields (kept for existing BI page compatibility)
  funnel: BiFunnel;
  staff: BiStaffMember[];
  sourceQuality: BiSourceQuality[];
  interviewerAccountability: BiInterviewerAccountability[];
  departmentAccountability: BiDepartmentAccountability[];
  alerts: BiManagerAlert[];
  demands: BiDemandMetrics;
  resumes: BiResumeMetrics;
  dataQualityWarnings: BiDataQualityWarning[];
}

export interface BiStaffDetail {
  hrId: number;
  summary: BiSummaryItem[];
  // Legacy fields
  funnel: BiFunnel;
  dataQualityWarnings: BiDataQualityWarning[];
}

export interface BiJobDetail {
  jobId: number;
  jobTitle: string;
  summary: BiSummaryItem[];
}

// ---- Deprecated BI compatibility types (old Flask-era structure) ----
// These are kept so existing BI page components compile. New code should use
// the simplified BiOverview/BiStaffDetail/BiJobDetail above.

export interface BiFunnel {
  pending?: number;
  ai_screen?: number;
  business_review?: number;
  interview?: number;
  offer?: number;
  onboarded?: number;
  rejected?: number;
  pipelineTotal?: number;
  archivedTotal?: number;
  funnelTotal?: number;
  conversionRate: number;
}

export interface BiStaffMember {
  hrId: number;
  name: string;
  resumes: number;
  parsedOk: number;
  parseFailed: number;
  parsePending: number;
  screens: number;
  effectiveRecommendations: number;
  businessReviewEntries: number;
  interviewEntries: number;
  interviewFeedbacks: number;
  interviewPassed: number;
  interviewPassRate: number;
  interviewToOfferRate: number;
  offerEntries: number;
  onboarded: number;
  conversionRate: number;
  recommendationToOnboardRate: number;
  feedbackPending: number;
  feedbackOverdue: number;
}

export interface BiSourceQuality {
  channel: string;
  resumes: number;
  parsedOk: number;
  parseFailed: number;
  effectiveRecommendations: number;
  interviewEntries: number;
  interviewPassed: number;
  interviewPassRate: number;
  interviewToOfferRate: number;
  offerEntries: number;
  onboarded: number;
  onboardRate: number;
}

export interface BiInterviewRoundAccountability {
  round: InterviewRound | string;
  roundLabel: string;
  assignedCount: number;
  feedbackSubmitted: number;
  passedCount: number;
  rejectedCount: number;
  pendingFeedback: number;
  overdueFeedback: number;
  passRate: number;
  rejectRate: number;
}

export interface BiInterviewerAccountability {
  interviewerId: number | null;
  interviewerName: string;
  assignedCount: number;
  feedbackSubmitted: number;
  passedCount: number;
  rejectedCount: number;
  pendingFeedback: number;
  overdueFeedback: number;
  passRate: number;
  rejectRate: number;
}

export interface BiDepartmentAccountability {
  department: string;
  jobsCount: number;
  interviewersCount: number;
  assignedCount: number;
  feedbackSubmitted: number;
  passedCount: number;
  rejectedCount: number;
  pendingFeedback: number;
  overdueFeedback: number;
  passRate: number;
  rejectRate: number;
  rounds: BiInterviewRoundAccountability[];
}

export interface BiDemandMetrics {
  activeTotal: number;
  priorityCounts: Record<DemandPriority, number>;
  overdue: number;
  hrNoRecommendation: number;
  businessFeedbackPending: number;
}

export interface BiResumeMetrics {
  totalCandidates: number;
  linkedToJob: number;
  unassigned: number;
  matchedCandidates: number;
  inPipeline: number;
  notInPipeline: number;
  matchRate: number;
  pipelineEntryRate: number;
}

export interface BiDataQualityWarning {
  kind: string;
  metric: string;
  label: string;
  numerator: number;
  denominator: number;
  detail: string;
}

export interface BiManagerAlert {
  kind: 'stale_pipeline' | 'pending_interview_feedback' | 'business_feedback_overdue' | string;
  priority: 'high' | 'medium' | 'low' | string;
  title: string;
  detail: string;
  candidateId: number;
  candidateName: string;
  jobId: number;
  jobTitle: string;
  stage: PipelineStage | string;
  stageLabel: string;
  ageDays: number;
  actionPath: string;
}

// QaPair for legacy interview Q&A display.
export interface QaPair {
  question: string;
  answer: string;
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
  active: boolean;
  createdAt: string | null;
}

export interface AdminUserCreateInput {
  name: string;
  email: string;
  password: string;
  role: Role;
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
  databaseAccess: boolean;
  readToolsAvailableToAuthenticatedUsers: boolean;
  readScopeNote: string;
  writeRequiresConfirmation: boolean;
  writeScopeNote: string;
  cannotDo: string[];
}

export interface AdminAiArchitecture {
  title: string;
  purpose: string;
  systemPrompt: string;
  readTools: AdminAiTool[];
  writeTools: AdminAiTool[];
  architecture: AdminAiArchitectureLayer[];
  permissionModel: AdminAiPermissionModel;
  safeguards: string[];
  recommendedNextSteps: string[];
}

export interface AuditLogItem {
  id: number;
  source: 'event';
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  payload: Record<string, unknown>;
  ts: string | null;
}

export interface AuditLogResponse {
  logs: AuditLogItem[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface AuditLogQuery {
  page?: number;
  perPage?: number;
  actorId?: number;
  action?: string;
  entityType?: string;
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

// Java GET /interviews/assignments returns camelCase fields.
export interface InterviewAssignment {
  id: number;
  interviewId: number;
  round: InterviewRound;
  interviewerId: number;
  interviewerName: string;
  scheduledAt: string | null;
  location: string;
  status: string;
  notes: string;
  createdAt: string | null;
  // Deprecated legacy fields — kept for existing assignment consumers.
  candidateId?: number;
  candidate_id?: number;
  nameMasked?: string | null;
  name_masked?: string | null;
  jobId?: number;
  job_id?: number;
  jobTitle?: string | null;
  job_title?: string | null;
  feedbackSubmitted?: boolean;
  feedback_submitted?: boolean;
  isOverdue?: boolean;
  is_overdue?: boolean;
  createdByName?: string | null;
  created_by_name?: string | null;
}

export interface InterviewAssignmentInput {
  interviewId: number;
  round: InterviewRound;
  interviewerId: number;
  scheduledAt?: string;
  location?: string;
  notes?: string;
}

// ---- Interview list + feedback ----
export interface InterviewListItem {
  id: number;
  type: 'ai' | 'feedback';
  candidateId: number;
  nameMasked: string | null;
  jobId: number;
  jobTitle: string | null;
  score: number | null;
  pass: boolean | null;
  round: string | null;
  interviewerId: number | null;
  interviewerName: string | null;
  evaluation: EvaluationScores | null;
  reasonTags: string[];
  strengths: string | null;
  concerns: string | null;
  note: string | null;
  createdAt: string | null;
}

export type EvaluationScores = Record<string, number>;

// Java InterviewFeedbackRequest: {candidateId, jobId, score, passRecommended, qaJson, aiReport}
export interface InterviewFeedbackInput {
  candidateId: number;
  jobId: number;
  score: number;
  passRecommended: boolean;
  qaJson?: string;
  aiReport?: string;
}

// Java InterviewGuide: {title, version, rounds: [{name, round, focusAreas, sampleQuestions, riskFactors}]}
export interface InterviewGuideRound {
  name: string;
  round: string;
  focusAreas: string[];
  sampleQuestions: string[];
  riskFactors: string[];
}

export interface InterviewGuide {
  title: string;
  version: string;
  rounds: InterviewGuideRound[];
}

// ---- Candidate pipeline context / journey (M4/M5) ----
export interface CandidatePipelineItem {
  jobId: number;
  jobTitle: string;
  stage: PipelineStage;
  updatedAt: string | null;
}

export interface CandidatePipelines {
  candidateId: number;
  nameMasked: string;
  pipelines: CandidatePipelineItem[];
}

export interface JourneyTimelineStep {
  stage: PipelineStage;
  ts: string | null;
  note: string | null;
  updatedByName: string | null;
}

export interface JourneyAiInterview {
  id: number;
  score: number | null;
  pass: boolean | null;
  createdAt: string | null;
}

export interface JourneyFeedback {
  id: number;
  round: string | null;
  score: number | null;
  passed: boolean | null;
  strengths: string | null;
  concerns: string | null;
  evaluation: EvaluationScores;
  reasonTags: string[];
  note: string | null;
  interviewerName: string | null;
  createdAt: string | null;
}

export interface JourneyDisposition {
  id: number;
  reason: string;
  intoPool: boolean;
  nextContactAt: string | null;
  tags: string[];
  note: string;
  createdByName: string | null;
  createdAt: string | null;
}

export interface DecisionSummary {
  currentStage: PipelineStage | null;
  feedbackCount: number;
  passedCount: number;
  failedCount: number;
  averageScore: number | null;
  aiInterviewCount: number;
  highlights: string[];
  risks: string[];
  recommendation: string;
}

export interface CandidateJourney {
  candidateId: number;
  nameMasked: string;
  jobId: number;
  jobTitle: string | null;
  timeline: JourneyTimelineStep[];
  aiInterviews: JourneyAiInterview[];
  feedback: JourneyFeedback[];
  dispositions: JourneyDisposition[];
  decisionSummary: DecisionSummary;
}

// ── BOSS 直聘集成（boss-cli 招聘端）──────────────────────────────
// 后端统一返回 {ok, data, error?}；此处 data 的形态依接口而定，统一用宽松类型。
// boss status --json 的裸 dict
export interface BossStatus {
  authenticated: boolean;
  credential_present?: boolean;
  cookie_count?: number;
  cookies?: string[];
  search_authenticated?: boolean;
  recommend_authenticated?: boolean;
  reason?: string | null;
}

// 招聘端在招职位条目（字段来自 boss-cli recruiter jobs）
export interface BossJob {
  jobName?: string;
  salaryDesc?: string;
  address?: string;
  encryptJobId?: string;
  [k: string]: unknown;
}

// 搜索/推荐候选人条目（字段名随 boss-cli 返回，统一宽松）
export interface BossCandidate {
  name?: string;
  geekName?: string;
  expectPositionName?: string;
  jobName?: string;
  workYearDesc?: string;
  workYear?: string | number;
  degreeDesc?: string;
  degree?: string | number;
  encryptGeekId?: string;
  encryptUid?: string;
  encryptFriendId?: string;
  friendId?: number;
  securityId?: string;
  salaryDesc?: string;
  lastTime?: string;
  newGeek?: boolean;
  sourceType?: number;
  [k: string]: unknown;
}

export interface BossRecommendParams {
  job?: string;
  limit?: number;
  page?: number;
}

export interface BossInboxParams {
  job?: string;
  label?: number;
  limit?: number;
  page?: number;
}

// BOSS 账号（多账号，不含 cookies 明文）
export interface BossAccount {
  id: number;
  label: string;
  cookie_count: number;
  is_active: boolean;
  last_verified_at: string | null;
  last_verified_ok: boolean | null;
  created_at: string | null;
}

// ── 招聘闭环：批量导入 / AI 初筛 ──────────────────────────────────
// 批量导入单条入参（来自收件箱列表勾选）
export interface BossImportItem {
  geek_id: string;
  name?: string;
  security_id?: string;
  friend_id?: number;
  job?: string;
}

export interface BossBatchImportParams {
  items: BossImportItem[];
  target_job_id?: number;
  boss_job?: string;
  limit?: number;
  interval_sec?: number;
}

export interface BossImportResultItem {
  geek_id: string;
  name?: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  code?: string;
  candidate_id?: number;
  target_job_id?: number | null;
}

export interface BossBatchImportResult {
  batch_id: number;
  imported: number;
  skipped: number;
  failed: number;
  stopped_reason: string | null;
  results: BossImportResultItem[];
}

export interface BossAiScreenParams {
  candidate_ids: number[];
  job_id: number;
}

export interface BossScreenResultItem {
  candidate_id: number;
  name?: string;
  status: 'ok' | 'error';
  reason?: string;
  score?: number | null;
  pass_recommended?: boolean;
  summary?: string;
  highlights?: string[];
  concerns?: string[];
}

export interface BossAiScreenResult {
  screened: number;
  failed: number;
  results: BossScreenResultItem[];
}

// ---- AI 助手会话与调用日志 ----
export interface ConversationSummary {
  id: number;
  title: string;
  messageCount: number;
  updatedAt: string | null;
  description?: string;
  lastMessageRole?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  page: number;
  perPage: number;
  total: number;
}

export interface ConversationDetailMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }> | null;
  thoughts?: string[] | null;
  createdAt: string | null;
}

export interface ConversationDetail {
  id: number;
  title: string;
  titleSource?: string;
  archived?: boolean;
  messages: ConversationDetailMessage[];
}

export interface CreateConversationResponse {
  id: number;
  title: string;
  archived: boolean;
  titleSource: string;
  createdAt: string | null;
}

export interface UpdateConversationResponse {
  id: number;
  title: string;
  titleSource: string;
  archived: boolean;
  updatedAt: string | null;
}

export interface AgentCallLogItem {
  id: number;
  conversationId: number | null;
  messageId: number | null;
  userId: number;
  role: string;
  kind: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  status: string;
  errorMsg: string | null;
  toolCalls: unknown;
  thoughts: unknown;
  inputText: string | null;
  outputText: string | null;
  createdAt: string | null;
}

export interface CallLogListResponse {
  items: AgentCallLogItem[];
  page: number;
  perPage: number;
  total: number;
}

export interface CallLogQuery {
  conversationId?: number;
  status?: string;
  kind?: string;
  userId?: number;
  page?: number;
  perPage?: number;
}
