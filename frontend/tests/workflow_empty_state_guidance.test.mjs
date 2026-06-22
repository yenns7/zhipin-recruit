import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const jobsPage = readSource('pages/JobsPage.tsx');
const demandsPage = readSource('features/demands/pages/DemandsPage.tsx');
const uploadPage = readSource('pages/UploadPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');
const addToPipeline = readSource('components/pipeline/AddToPipeline.tsx');
const pipelineCandidatePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');
const interviewAssignment = readSource('components/interviewRecords/InterviewAssignmentPanel.tsx');
const interviewListPage = readSource('pages/InterviewListPage.tsx');
const reassignOwner = readSource('components/candidate/ReassignOwner.tsx');
const biPage = readSource('pages/BiPage.tsx');
const usersPage = readSource('pages/admin/UsersPage.tsx');
const apiClient = readSource('lib/api.ts');
const types = readSource('types/index.ts');

assert.match(
  apiClient,
  /listJobs\(status\?:\s*'active'\s*\|\s*'closed'\s*\|\s*'all'\)/,
  'Frontend API should allow pages to request active, closed, or all jobs without changing existing default calls',
);

assert.match(
  apiClient,
  /restoreJob\(jobId:\s*number\)/,
  'Frontend API should expose restoring a closed job',
);
assert.match(
  apiClient,
  /listCandidateOwners\(\)/,
  'Frontend API should expose recruiter owner options for non-technical candidate reassignment',
);

assert.match(
  types,
  /status:\s*'active'\s*\|\s*'closed'\s*\|\s*string/,
  'Job list items should carry lifecycle status so closed jobs are explainable in the UI',
);

assert.match(
  jobsPage,
  /在招岗位/,
  'Jobs page should let HR distinguish active jobs from closed jobs',
);
assert.match(
  jobsPage,
  /已关闭岗位/,
  'Jobs page should expose closed jobs instead of making them disappear',
);
assert.match(
  jobsPage,
  /恢复在招/,
  'Jobs page should offer a clear restore action for closed jobs',
);

for (const [name, source] of [
  ['demands page', demandsPage],
  ['upload page', uploadPage],
  ['pipeline page', pipelinePage],
  ['interview assignment panel', interviewAssignment],
]) {
  assert.match(
    source,
    /新建岗位/,
    `${name} should guide users to create a job when the target job is missing`,
  );
}

assert.match(
  addToPipeline,
  /暂无可加入候选人，请先上传简历/,
  'Pipeline add panel should distinguish an empty candidate library from all candidates already being in the job pipeline',
);
assert.match(
  addToPipeline,
  /没有目标候选人？上传简历/,
  'Pipeline add panel should keep an upload entry visible even when the candidate list is not empty',
);

assert.match(
  interviewAssignment,
  /暂无候选人，请先上传简历/,
  'Interview assignment should guide HR to upload resumes when no candidate exists',
);
assert.match(
  interviewAssignment,
  /暂无可选面试官，请管理员先创建或启用面试官账号/,
  'Interview assignment should explain the admin action required when no interviewer account exists',
);
assert.match(
  interviewAssignment,
  /联系管理员创建或启用面试官账号/,
  'Interview assignment should give non-admin users a plain-language next step when interviewer accounts are missing',
);
assert.match(
  interviewAssignment,
  /ROLE_LABEL/,
  'Interview assignment should display interviewer roles to avoid picking the wrong account type',
);
assert.match(
  interviewAssignment,
  /没有目标候选人？上传简历/,
  'Interview assignment should keep an upload entry visible next to candidate selection',
);
assert.match(
  interviewAssignment,
  /没有目标岗位？新建岗位/,
  'Interview assignment should keep a job creation entry visible next to job selection',
);
assert.match(
  interviewListPage,
  /暂无分配给你的面试任务，请等待 HR 或管理员安排/,
  'Interviewer empty state should explain they need to wait for HR/admin assignment',
);
assert.match(
  interviewListPage,
  /role === 'interviewer'[\s\S]*暂无分配给你的面试任务/,
  'Interviewer empty state copy should be role-specific instead of suggesting unavailable actions',
);

assert.match(
  pipelineCandidatePanel,
  /修正阶段/,
  'Pipeline panel should label arbitrary stage changes as stage corrections, not technical jumps',
);
assert.match(
  pipelineCandidatePanel,
  /请填写修正原因/,
  'Pipeline stage correction should require a reason so later reviewers understand the fix',
);
assert.match(
  pipelineCandidatePanel,
  /阶段修正：/,
  'Pipeline stage correction notes should be marked for timeline and BI review',
);
assert.match(
  pipelineCandidatePanel,
  /历史记录会保留/,
  'Pipeline correction UI should explain that history remains and current BI stock changes',
);

assert.match(
  reassignOwner,
  /选择新的招聘专员/,
  'Candidate reassignment should use a recruiter dropdown instead of requiring a user id',
);
assert.doesNotMatch(
  reassignOwner,
  /HR 用户 ID|type="number"/,
  'Candidate reassignment should not ask product users to type a technical user id',
);
assert.match(
  reassignOwner,
  /转派原因/,
  'Candidate reassignment should ask for a business reason',
);

assert.match(
  biPage,
  /责任怎么算/,
  'BI page should include a plain-language responsibility explanation card',
);
assert.match(
  biPage,
  /候选人负责人：算 HR 绩效/,
  'BI responsibility explanation should distinguish HR ownership from operations',
);
assert.match(
  biPage,
  /最后推进人：算操作留痕/,
  'BI responsibility explanation should distinguish last operator from owner',
);
assert.match(
  biPage,
  /去候选人管道查看卡点|去面试工作台催反馈|检查是否跳过面试直接进入 Offer/,
  'BI anomalies should suggest the next operational action',
);

assert.match(
  usersPage,
  /试点建议一人一个账号/,
  'Admin user management should remind admins how to create traceable pilot accounts',
);
assert.match(
  usersPage,
  /暂无成员账号/,
  'Admin user management should have a clear empty state',
);
