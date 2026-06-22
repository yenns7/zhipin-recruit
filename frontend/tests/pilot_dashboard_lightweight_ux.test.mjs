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
const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');
const pipelinePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');

assert.match(
  types,
  /performance\??:\s*BiStaffMember/,
  'Personal BI detail should expose the same public performance row used by manager BI',
);
assert.match(
  dashboardPage,
  /我的本月业绩/,
  'Recruiter dashboard should show a personal monthly performance panel',
);
assert.match(
  dashboardPage,
  /今日待办/,
  'Recruiter dashboard should show a lightweight daily follow-up panel',
);
assert.match(
  dashboardPage,
  /stats\.performance/,
  'Recruiter dashboard should consume the personal BI performance payload',
);
assert.match(
  dashboardPage,
  /feedback_pending/,
  'Recruiter dashboard should surface pending interview feedback as an urgent follow-up',
);
assert.match(
  dashboardPage,
  /推荐成功面试/,
  'Recruiter dashboard should use the generic interview-entry metric',
);
assert.match(
  biPage,
  /口径说明/,
  'BI page should explain the public MVP metric definitions',
);
assert.match(
  biPage,
  /推荐成功面试 = 进入“面试中”阶段/,
  'BI page should clarify that interview-entry metrics are based on the interview stage',
);
assert.match(
  biPage,
  /面试通过 = 面试反馈里标记通过的人/,
  'BI page should clarify that pass metrics come from feedback facts',
);
assert.match(
  biPage,
  /主绩效按候选人负责人归属/,
  'BI page should clarify that HR performance is attributed to candidate ownership',
);
assert.match(
  biPage,
  /Offer = 已推进到 Offer 阶段/,
  'BI page should clarify that Offer metrics come from pipeline stages',
);
assert.match(
  biPage,
  /已入职 = 已推进到已入职阶段/,
  'BI page should clarify that onboarded metrics come from pipeline stages',
);
assert.match(
  pipelinePanel,
  /主流程状态/,
  'Candidate pipeline panel should remind users that interview details live outside the main stage flow',
);
