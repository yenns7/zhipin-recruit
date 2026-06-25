import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

assert.ok(
  !existsSync(join(srcRoot, 'pages/MatchCandidatesPage.tsx')),
  'Candidate matching should not add a duplicate landing page beside the job list',
);

const nav = readSource('lib/nav.ts');
assert.doesNotMatch(
  nav,
  /label:\s*'匹配候选人'/,
  'Sidebar should not add matching as a duplicate top-level module',
);

const shell = readSource('components/AppShell.tsx');
assert.doesNotMatch(
  shell,
  /'\/match'/,
  'The app shell should not treat a removed matching landing page as top-level',
);

const app = readSource('App.tsx');
assert.doesNotMatch(app, /MatchCandidatesPage/, 'App routes should not lazy-load a deleted duplicate page');
assert.doesNotMatch(
  app,
  /path="\/match"/,
  'The /match landing route should be removed instead of keeping a duplicate job-selection screen',
);

const dashboard = readSource('pages/DashboardPage.tsx');
assert.match(
  dashboard,
  /to:\s*'\/jobs'[\s\S]*label:\s*'匹配候选人'/,
  'Dashboard common actions should send HR to the existing job list to choose a job',
);

const recruitmentTabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
assert.doesNotMatch(
  recruitmentTabs,
  /label:\s*'匹配候选人'/,
  'Recruitment tabs should not duplicate matching beside job portrait',
);

const jobsPage = readSource('pages/JobsPage.tsx');
assert.match(
  jobsPage,
  /to=\{`\/jobs\/\$\{job\.id\}\/match`\}[\s\S]*匹配候选人/,
  'Active job rows should still expose the direct match action for that job',
);

assert.match(
  jobsPage,
  /inline-flex h-8 items-center[\s\S]*匹配候选人/,
  'Job-row matching action should be visually stronger than a plain text link',
);

const jobMatchPage = readSource('pages/JobMatchPage.tsx');
assert.match(jobMatchPage, /岗位匹配结果/, 'Result page title should say it is the result step');
assert.match(
  jobMatchPage,
  /招聘岗位[\s\S]*匹配结果/,
  'Result page breadcrumb should distinguish recruiting jobs from matching results',
);
assert.doesNotMatch(
  jobMatchPage,
  /岗位画像/,
  'Matching result navigation should not expose internal job-portrait wording',
);
