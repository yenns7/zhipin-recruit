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
const candidatesNav = readSource('features/candidates/nav.ts');
const shell = readSource('components/AppShell.tsx');
const dashboard = readSource('pages/DashboardPage.tsx');
const interviews = readSource('pages/InterviewListPage.tsx');

assert.doesNotMatch(
  nav,
  /label:\s*'通知中心'/,
  'Notifications should be a top-bar utility, not a primary sidebar module',
);

assert.ok(
  /label:\s*'简历库'/.test(candidatesNav) &&
    nav.indexOf('...featureNavItems') < nav.indexOf("label: '岗位管理'") &&
    nav.indexOf("label: '岗位管理'") < nav.indexOf("label: '招聘流程'") &&
    nav.indexOf("label: '招聘流程'") < nav.indexOf("label: '面试中心'"),
  'Sidebar should follow the HR workflow: resume library -> jobs -> pipeline -> interviews',
);

assert.ok(
  nav.indexOf("label: '面试中心'") < nav.indexOf("label: 'AI 助手'"),
  'AI assistant should support the workflow instead of interrupting the main HR path',
);

assert.match(
  shell,
  /Bell/,
  'App shell should expose notification center from the top bar',
);
assert.match(
  shell,
  /to="\/notifications"/,
  'Top bar notification button should link to the notification center',
);
assert.match(
  shell,
  /'\/notifications'/,
  'Notification center should be treated as a top-level shell path',
);

assert.match(
  dashboard,
  /常用动作/,
  'Dashboard should present role-focused actions rather than a second full menu',
);
assert.match(
  dashboard,
  /WORKFLOW_ACTIONS/,
  'Dashboard should use explicit role workflow actions',
);
assert.doesNotMatch(
  dashboard,
  /navItemsForRole/,
  'Dashboard should not duplicate every sidebar navigation item',
);
assert.doesNotMatch(
  dashboard,
  /快速进入/,
  'Dashboard should avoid repeating the sidebar as a quick-entry grid',
);

assert.match(
  interviews,
  /待我处理/,
  'Interview center should lead with pending work for HR and interviewers',
);
assert.match(
  interviews,
  /面试记录/,
  'Interview center should expose records as a clear workspace section',
);
