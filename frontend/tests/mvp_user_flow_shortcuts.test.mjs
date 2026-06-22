import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const dashboardPage = readSource('pages/DashboardPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');
const pipelineList = readSource('components/pipeline/PipelineCandidateList.tsx');
const agentPage = readSource('pages/AgentPage.tsx');
const myInterviews = readSource('components/interviewRecords/MyInterviewsPanel.tsx');
const interviewPage = readSource('pages/InterviewListPage.tsx');
const demandsPage = readSource('features/demands/pages/DemandsPage.tsx');
const settingsPage = readSource('pages/admin/SystemSettingsPage.tsx');
const usersPage = readSource('pages/admin/UsersPage.tsx');

assert.match(
  dashboardPage,
  /stage=business_review/,
  'Recruiter business-feedback todo should deep-link to the business review stage',
);
assert.match(
  dashboardPage,
  /stage=interview/,
  'Recruiter interview follow-up todo should deep-link to the interview stage',
);
assert.match(
  dashboardPage,
  /stage=offer/,
  'Recruiter offer follow-up todo should deep-link to the offer stage',
);
assert.doesNotMatch(
  dashboardPage,
  /label:\s*'处理面试反馈'/,
  'Dashboard should avoid a second generic interview shortcut after left-nav consolidation',
);
assert.match(
  dashboardPage,
  /to="\/interviews\?focus=pending"[\s\S]*label="待补反馈"/,
  'Recruiter dashboard should keep pending feedback as a concrete todo deep link',
);

assert.match(
  pipelinePage,
  /requestedStage/,
  'Pipeline page should read a stage query parameter',
);
assert.match(
  pipelinePage,
  /PREFERRED_STAGE_ORDER/,
  'Pipeline page should pick the first useful non-empty stage when no stage is requested',
);
assert.match(
  pipelinePage,
  /setSearchParams\(\{ job: String\(jobId\), stage: activeStage \}\)/,
  'Pipeline job switching should preserve the active stage in the URL',
);
assert.match(
  pipelineList,
  /onJumpToStage/,
  'Empty pipeline stages should offer jump actions to non-empty stages',
);
assert.match(
  pipelineList,
  /去匹配更多候选人[\s\S]*上传简历/,
  'Empty pipeline stage guidance should include matching and resume upload next steps',
);

assert.match(
  agentPage,
  /EXAMPLES_BY_ROLE/,
  'AI assistant examples should be chosen per role',
);
assert.match(
  agentPage,
  /recruiter:[\s\S]*我负责的候选人现在卡在哪些阶段/,
  'Recruiter AI examples should focus on owned candidates instead of team BI',
);
assert.match(
  agentPage,
  /manager:[\s\S]*看看团队招聘漏斗报表/,
  'Manager AI examples should keep team BI prompts',
);
assert.match(
  agentPage,
  /admin:[\s\S]*审计/,
  'Admin AI examples should mention governance or audit-oriented prompts',
);

assert.match(
  myInterviews,
  /onStartFeedback/,
  'My interviews task cards should expose a direct feedback callback',
);
assert.match(
  myInterviews,
  /填写反馈/,
  'My interviews task cards should show a visible feedback CTA',
);
assert.match(
  interviewPage,
  /handleStartAssignmentFeedback/,
  'Interview page should wire assignment task cards into the existing feedback form',
);

assert.doesNotMatch(
  demandsPage,
  /window\.prompt/,
  'Demand close/restore/priority actions should use in-app dialogs instead of browser prompts',
);
assert.match(
  demandsPage,
  /DemandActionDialog/,
  'Demand actions should use a local dialog component with a required business reason',
);
assert.match(
  demandsPage,
  /这次操作会影响/,
  'Demand action dialog should explain the business impact before submitting',
);

assert.match(
  settingsPage,
  /role="tablist"/,
  'System settings should present admin sections as tabs',
);
assert.match(
  settingsPage,
  /账号管理[\s\S]*审计日志[\s\S]*AI 边界/,
  'System settings tabs should separate account management, audit logs, and AI boundaries',
);
assert.match(
  usersPage,
  /showCreateForm/,
  'Account management should collapse the create-account form behind an explicit action',
);
assert.match(
  usersPage,
  /成员列表[\s\S]*创建账号/,
  'Account management should lead with the member list before account creation',
);
