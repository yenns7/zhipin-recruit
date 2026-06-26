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
const demandsNav = readSource('features/demands/nav.ts');
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
    /label:\s*'招聘管理'/.test(demandsNav) &&
    nav.indexOf('...featureNavItems') < nav.indexOf("label: '候选人流程'") &&
    nav.indexOf("label: '候选人流程'") < nav.indexOf("label: '数据看板'"),
  'Sidebar should follow the HR workflow without adding interview as a second workbench',
);

assert.doesNotMatch(
  nav,
  /label:\s*'面试工作台'/,
  'Interview tasks should not remain as a duplicate top-level workbench',
);

assert.match(
  nav,
  /label:\s*'我的面试'[\s\S]*roles:\s*\['interviewer'\]/,
  'Interviewers should keep a narrow My Interviews sidebar entry',
);

assert.doesNotMatch(
  nav,
  /label:\s*'岗位管理'/,
  'Job management should be nested under 招聘管理 instead of competing as another sidebar module',
);

assert.ok(
  nav.indexOf("label: '数据看板'") < nav.indexOf("label: 'AI 助手'"),
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
assert.doesNotMatch(
  shell,
  /data-shell="identity"/,
  'Sidebar should not repeat the current user card when the account menu already owns account actions',
);
assert.match(
  shell,
  /data-shell="account-menu"[\s\S]*aria-label="账户菜单"[\s\S]*修改密码[\s\S]*退出登录/,
  'Password change and logout should live in one compact account menu instead of separate persistent top-bar buttons',
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
  /label:\s*'处理面试反馈'/,
  'Dashboard common actions should not recreate a generic interview-workbench shortcut',
);
assert.match(
  dashboard,
  /to="\/interviews\?focus=pending"[\s\S]*label="待补反馈"/,
  'Dashboard should keep interview feedback reachable as a specific todo',
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
  'Interview task page should lead with pending work for HR and interviewers',
);
assert.match(
  interviews,
  /面试记录/,
  'Interview task page should expose records as a clear workspace section',
);
