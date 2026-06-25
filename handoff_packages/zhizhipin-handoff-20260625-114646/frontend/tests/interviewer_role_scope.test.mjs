import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const nav = readSource('lib/nav.ts');
const candidatePermissions = readSource('features/candidates/permissions.ts');
const candidateRoutes = readSource('features/candidates/routes.tsx');
const dashboard = readSource('pages/DashboardPage.tsx');
const app = readSource('App.tsx');
const interviewPage = readSource('pages/InterviewListPage.tsx');
const appShell = readSource('components/AppShell.tsx');
const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
const candidateListRolesBlock = candidatePermissions.match(/CANDIDATE_LIST_ROLES[\s\S]*?\];/)?.[0] ?? '';
const candidateDetailRolesBlock = candidatePermissions.match(/CANDIDATE_DETAIL_ROLES[\s\S]*?\];/)?.[0] ?? '';
const pipelineNavBlock = nav.match(/to:\s*'\/pipeline'[\s\S]*?\n\s*\},/)?.[0] ?? '';
const agentNavBlock = nav.match(/to:\s*'\/agent'[\s\S]*?\n\s*\},/)?.[0] ?? '';

assert.match(
  candidateListRolesBlock,
  /'recruiter'[\s\S]*'manager'[\s\S]*'admin'/,
  'Candidate library list should stay available to HR/manager/admin',
);
assert.doesNotMatch(
  candidateListRolesBlock,
  /'interviewer'/,
  'Interviewers should not have candidate library as a browsable list',
);
assert.match(
  candidateDetailRolesBlock,
  /'interviewer'/,
  'Interviewers should still open assigned candidate details from My Interviews',
);
assert.match(
  candidateRoutes,
  /path:\s*'\/candidates'[\s\S]*roles:\s*CANDIDATE_LIST_ROLES/,
  'Candidate list route should use the narrower list role set',
);
assert.match(
  candidateRoutes,
  /path:\s*'\/candidates\/:id'[\s\S]*roles:\s*CANDIDATE_DETAIL_ROLES/,
  'Candidate detail route should keep interviewer access for assigned interview context',
);
assert.doesNotMatch(
  pipelineNavBlock,
  /'interviewer'/,
  'Interviewers should not see candidate pipeline as a primary sidebar module',
);
assert.doesNotMatch(
  agentNavBlock,
  /'interviewer'/,
  'Interviewers should not see AI assistant as a primary sidebar module in the MVP trial',
);
assert.match(
  dashboard,
  /interviewer:\s*\['\/interviews'\]/,
  'Interviewer dashboard quick actions should be narrowed to My Interviews',
);
assert.match(
  dashboard,
  /action:\s*\{\s*to:\s*'\/interviews',\s*label:\s*'查看我的面试'/,
  'Interviewer primary dashboard action should land on My Interviews',
);
assert.match(
  app,
  /path="\/agent"[\s\S]*allow=\{\['recruiter', 'manager', 'admin'\]\}/,
  'AI assistant route should be role-gated away from interviewers',
);
assert.match(
  app,
  /path="\/pipeline"[\s\S]*allow=\{\['recruiter', 'manager', 'admin'\]\}/,
  'Candidate pipeline route should be role-gated away from interviewers',
);
assert.doesNotMatch(
  interviewPage,
  /role === 'interviewer'\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*api\.listInterviewers\(\)/,
  'Interview workspace should avoid broad HR-style lookup branches for interviewer accounts',
);
assert.match(
  interviewPage,
  /const isInterviewer = role === 'interviewer'/,
  'Interview workspace should use an explicit interviewer mode for narrower data loading',
);
assert.match(
  feedbackForm,
  /canMovePipeline\??:\s*boolean/,
  'Feedback form should expose an explicit permission for pipeline-moving actions',
);
assert.match(
  feedbackForm,
  /canMovePipeline\s*&&[\s\S]*提交并推进 Offer[\s\S]*提交并淘汰/,
  'Feedback form should hide pipeline-moving buttons when the current role cannot move candidates',
);
assert.match(
  interviewPage,
  /canMovePipeline=\{!isInterviewer\}/,
  'Interviewer feedback entry should pass a narrowed pipeline-moving permission',
);
assert.match(
  appShell,
  /interviewer:\s*'面试官'/,
  'Top account menu should still identify interviewer role',
);
assert.doesNotMatch(
  appShell,
  /我的面试 · 反馈填写/,
  'App shell should not repeat interviewer task guidance in a persistent sidebar identity card',
);
assert.match(
  dashboard,
  /listInterviewAssignments\(\)/,
  'Interviewer dashboard should derive task metrics from assigned interview tasks',
);
assert.match(
  dashboard,
  /待我反馈[\s\S]*今日面试[\s\S]*已反馈[\s\S]*超时待反馈/,
  'Interviewer dashboard should show task-oriented metrics instead of HR inventory metrics',
);
