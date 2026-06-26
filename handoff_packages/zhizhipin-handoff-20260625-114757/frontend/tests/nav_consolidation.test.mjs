import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const nav = readSource('lib/nav.ts');
const app = readSource('App.tsx');
const shell = readSource('components/AppShell.tsx');

assert.doesNotMatch(
  nav,
  /label:\s*'简历上传'/,
  'Resume upload should be an in-page action from 简历库 instead of a top-level sidebar item',
);

assert.match(
  nav,
  /label:\s*'系统设置'/,
  'Admin-only sidebar should expose one consolidated 系统设置 entry',
);

assert.doesNotMatch(
  nav,
  /label:\s*'用户管理'/,
  '用户管理 should be nested inside 系统设置 instead of a separate sidebar item',
);

assert.doesNotMatch(
  nav,
  /\{\s*to:\s*'\/jobs'[\s\S]*label:\s*'岗位管理'[\s\S]*\}/,
  '岗位管理 should not remain as a separate top-level sidebar item after recruitment consolidation',
);

const interviewNavBlock = nav.match(/\{\s*to:\s*'\/interviews'[\s\S]*?\n\s*\},/)?.[0] ?? '';

assert.match(
  interviewNavBlock,
  /label:\s*'我的面试'/,
  'Interview sidebar entry should be phrased as a narrow interviewer task entry',
);

assert.match(
  interviewNavBlock,
  /roles:\s*\['interviewer'\]/,
  'Recruiters, managers, and admins should not see interviews as a top-level sidebar module',
);

assert.doesNotMatch(
  interviewNavBlock,
  /面试工作台|'recruiter'|'manager'|'admin'/,
  'Interview entry should not keep workbench wording or broad HR/admin sidebar access',
);

assert.doesNotMatch(
  nav,
  /label:\s*'AI 提示词看板'/,
  'AI 提示词看板 should be nested inside 系统设置 instead of a separate sidebar item',
);

assert.match(
  app,
  /path="\/admin\/settings"/,
  'Router should include the consolidated system settings route',
);

assert.match(
  app,
  /path="\/upload"/,
  'Upload route should remain available even after it leaves top-level navigation',
);

assert.match(
  app,
  /path="\/interviews"[\s\S]*allow=\{\['recruiter', 'interviewer', 'manager', 'admin'\]\}/,
  'Interview task route should remain available for deep links from dashboard and pipeline',
);

assert.match(
  app,
  /path="\/admin\/users"/,
  'Legacy user management route should remain available',
);

assert.match(
  app,
  /path="\/admin\/ai-architecture"/,
  'Legacy AI architecture route should remain available',
);

assert.match(
  shell,
  /'\/admin\/settings'/,
  'System settings should be treated as a top-level shell path',
);

assert.match(
  shell,
  /isNavItemActive/,
  'App shell should support explicit active path groups for consolidated nav entries',
);

assert.ok(
  existsSync(join(srcRoot, 'pages/admin/SystemSettingsPage.tsx')),
  'System settings page should exist',
);

const settingsPage = readSource('pages/admin/SystemSettingsPage.tsx');

assert.match(
  settingsPage,
  /UsersManagementContent/,
  'System settings should embed user management content',
);

assert.match(
  settingsPage,
  /AiArchitectureContent/,
  'System settings should embed AI architecture content',
);

assert.match(
  settingsPage,
  /openSection/,
  'System settings should use local state to expand one embedded section at a time',
);
