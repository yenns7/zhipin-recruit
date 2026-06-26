import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const repoRoot = join(__dirname, '../..');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

function readRepo(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

const loginPage = readSource('pages/LoginPage.tsx');
assert.doesNotMatch(loginPage, /去注册|创建账户|mode === 'register'/, 'pilot login page should not expose public registration');
assert.match(loginPage, /管理员分配|分配的账号/, 'pilot login page should tell users to use assigned accounts');

const usersPage = readSource('pages/admin/UsersPage.tsx');
assert.match(usersPage, /创建账号/, 'admin users page should let admins create pilot accounts');
assert.match(usersPage, /重置密码/, 'admin users page should let admins reset pilot user passwords');
assert.match(usersPage, /api\.createUser/, 'admin users page should call the admin create-user API');
assert.match(usersPage, /api\.resetUserPassword/, 'admin users page should call the admin reset-password API');

const api = readSource('lib/api.ts');
assert.match(api, /createUser/, 'API client should expose createUser');
assert.match(api, /resetUserPassword/, 'API client should expose resetUserPassword');

const types = readSource('types/index.ts');
assert.match(types, /AdminUserCreateInput/, 'types should declare the admin create-user request');
assert.match(types, /reason_tags\?: string\[\]/, 'interview feedback input should include structured reason tags');

const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
assert.match(feedbackForm, /FEEDBACK_REASON_OPTIONS/, 'feedback form should define fixed reason options');
assert.match(feedbackForm, /专业能力不匹配/, 'feedback form should include candidate-side reasons');
assert.match(feedbackForm, /岗位要求变化/, 'feedback form should include business-side reasons');
assert.doesNotMatch(feedbackForm, /岗位画像变化/, 'feedback form should avoid internal job-portrait wording');
assert.match(feedbackForm, /候选人已接受其他机会/, 'feedback form should include common candidate drop-off reasons');
assert.match(feedbackForm, /岗位暂停招聘/, 'feedback form should include common demand-side stop reasons');
assert.match(feedbackForm, /面试时间无法协调/, 'feedback form should include coordination reasons');
assert.match(feedbackForm, /reason_tags/, 'feedback form should submit reason tags');

const running = readRepo('RUNNING.md');
assert.match(
  running,
  /可直接转发的试用说明/,
  'running doc should include a concise pilot message that can be copied to testers',
);
assert.match(
  running,
  /看清候选人推进到哪一步/,
  'pilot message should lead with user value instead of technical caveats',
);
assert.match(
  running,
  /管理员账号用于创建账号、重置密码和管理角色/,
  'pilot docs should clarify that MVP admin is account management, not full enterprise governance',
);
