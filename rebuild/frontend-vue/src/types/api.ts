export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

export interface AuthSessionResponse {
  token: string
  role: 'admin' | 'manager' | 'recruiter' | 'interviewer'
  name: string
}

export interface AuthLogoutResponse {
  message: string
}

export interface UserPasswordChangeResponse {
  message: string
}

export interface DashboardSummaryMetric {
  key: string
  label: string
  value: number
  trend: string
  trendDirection: 'up' | 'down' | 'neutral'
}

export interface DashboardPipelineMetric {
  stage: string
  label: string
  count: number
}

export interface DashboardFocusItem {
  title: string
  subtitle: string
  status: string
  owner: string
  dueHint: string
}

export interface DashboardActivityItem {
  title: string
  detail: string
  occurredAt: string
}

export interface DashboardOverviewResponse {
  summary: DashboardSummaryMetric[]
  pipeline: DashboardPipelineMetric[]
  focusList: DashboardFocusItem[]
  activity: DashboardActivityItem[]
  generatedAt: string
}

export interface ResumeUploadResult {
  file: string
  status: 'PENDING' | 'PROCESSING' | 'PARSED' | 'FAILED' | 'ok' | 'skipped' | 'error'
  task_id?: string
  candidate_id?: number
  reason?: string
  target_job_id?: number
  pipeline_stage?: string
}

export interface ResumeUploadResponse {
  batch_id?: number
  total: number
  results: ResumeUploadResult[]
}

export interface ResumeUploadTaskResponse extends ResumeUploadResult {}

export interface NotificationTodoSummary {
  title: string
  highlight: string
  openCount: number
}

export interface NotificationTodoItem {
  id: string
  title: string
  message: string
  priority: 'high' | 'medium' | 'low'
  priorityLabel: string
  status: string
  statusLabel: string
  nextActionLabel: string
  nextActionPath: string
  dueHint: string
  audience: 'admin' | 'manager' | 'recruiter' | 'interviewer'
}

export interface NotificationTodoResponse {
  role: 'admin' | 'manager' | 'recruiter' | 'interviewer'
  generatedAt: string
  summary: NotificationTodoSummary
  items: NotificationTodoItem[]
}

export interface NotificationTodoMutationResponse {
  id: string
  status: 'completed' | 'archived'
  statusLabel: string
}

export interface SystemParameterEntry {
  key: string
  label: string
  value: string
  category: string
  exposure: string
  mutable: boolean
}

export interface SystemParameterSummary {
  totalCount: number
  mutableCount: number
  entries: SystemParameterEntry[]
}

export interface SystemModelEntry {
  id: string
  provider: string
  model: string
  scenario: string
  status: string
  fallbackModel: string
  note: string
  mutable: boolean
}

export interface SystemModelSummary {
  totalCount: number
  rolloutMode: string
  entries: SystemModelEntry[]
}

export interface SystemOverviewResponse {
  generatedAt: string
  demoNotice: string
  parameterSummary: SystemParameterSummary
  modelSummary: SystemModelSummary
}

export interface SystemAuditLogItem {
  id: string
  action: string
  actorName: string
  actorRole: 'admin'
  targetType: string
  targetName: string
  result: string
  detail: string
  happenedAt: string
}

export interface SystemAuditLogResponse {
  generatedAt: string
  demoNotice: string
  total: number
  items: SystemAuditLogItem[]
}

export interface SystemGovernanceMutationResponse {
  generatedAt: string
  demoNotice: string
  message: string
  targetType: 'parameter' | 'model'
  targetName: string
  currentValue: string
}

export type AdminUserRole = 'recruiter' | 'manager' | 'admin' | 'interviewer'

export interface AdminUserApiItem {
  id: number
  name: string
  email: string
  role: AdminUserRole
  active?: boolean
  isActive?: boolean
  createdAt: string | null
}

export interface AdminUserListItem {
  id: number
  name: string
  email: string
  role: AdminUserRole
  isActive: boolean
  createdAt: string | null
}

export interface AdminUserCreatePayload {
  name: string
  email: string
  role: AdminUserRole
  password: string
  active: boolean
}

export interface AdminUserUpdatePayload {
  name: string
  role: AdminUserRole
  active: boolean
}

export interface AdminUserResetPasswordPayload {
  newPassword: string
}

export interface AdminUserResetPasswordResponse {
  message: string
}

export interface AdminUserGovernanceMutationResponse {
  generatedAt: string
  message: string
  userId: number
  userName: string
  role: AdminUserRole
  isActive: boolean
  actorName: string
}

export interface CandidateListItem {
  id: number
  name_masked: string
  parse_status: string
  created_at?: string | null
}

export interface CandidatePipelineRecord {
  stageId: number
  jobId: number
  jobTitle: string
  stage: string
  ts: string
}

export interface CandidateDetailResponse {
  id: number
  nameMasked: string
  emailMasked: string
  phoneMasked: string
  parseStatus: string
  sourceLabel: string
  sourceDetail: string
  inPipeline: boolean
  createdAt: string
  latestUpdatedAt: string
  pipelineStageCount: number
  activeJobCount: number
  currentStage: string | null
  currentJobId: number | null
  currentJobTitle: string | null
  pipelineRecords: CandidatePipelineRecord[]
}

// Pipeline rollback types
export interface PipelineStageSummary {
  stageEntryId: number
  stage: string
  operatorName: string | null
  happenedAt: string | null
}

export interface RollbackPreview {
  canRollback: boolean
  currentStage: string | null
  targetStage: string | null
  explanation: string | null
  history: PipelineStageSummary[] | null
  reasonIfBlocked: string | null
}

export interface InterviewLinkInfo {
  reopened: boolean
  interviewFeedbackId: number | null
  note: string | null
}

export interface PipelineCorrectionResponse {
  stageEntryId: number
  eventType: string
  fromStage: string
  toStage: string
  explanation: string
  interviewAffected: boolean
  interviewLink: InterviewLinkInfo | null
  historyHint: string
}

export interface InterviewFeedbackItem {
  id: number
  candidateId: number
  jobId: number
  interviewerId: number | null
  score: number | null
  passRecommended: boolean | null
  createdAt: string | null
  reopenedAt: string | null
  reopened: boolean
}

// ---- Talent Map ----

export interface TalentMapCompany {
  id: number
  map_id: number
  company_name: string
  city: string
  region: string
  industry: string
  priority: string
  note: string
  created_at: string | null
  updated_at: string | null
}

export interface TalentMapPerson {
  id: number
  map_id: number
  company_id: number | null
  company_name: string
  name: string
  title: string
  city: string
  tags: string[]
  salary_range: string
  contact_status: string
  evaluation: string
  source: string
  next_follow_at: string | null
  note: string
  created_at: string | null
  updated_at: string | null
}

export interface TalentMapSummary {
  id: number
  name: string
  job_id: number | null
  job_title: string
  department: string
  owner_hr_id: number
  companies_count: number
  people_count: number
  updated_at: string | null
}

export interface TalentMap extends TalentMapSummary {
  board_json: Record<string, unknown>
  companies: TalentMapCompany[]
  people: TalentMapPerson[]
  created_at: string | null
}

export interface TalentMapInput {
  name: string
  job_id?: number | null
  department?: string
  board_json?: Record<string, unknown>
}

export interface TalentMapCompanyInput {
  company_name: string
  city?: string
  region?: string
  industry?: string
  priority?: string
  note?: string
}

export interface TalentMapPersonInput {
  company_id?: number | null
  name: string
  title?: string
  city?: string
  tags?: string[]
  salary_range?: string
  contact_status?: string
  evaluation?: string
  source?: string
  next_follow_at?: string
  note?: string
}

export interface TalentMapFilters {
  company?: string
  city?: string
  status?: string
  keyword?: string
}
