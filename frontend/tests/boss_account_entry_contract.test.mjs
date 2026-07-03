import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const bossPage = readSource('features/boss/pages/BossPage.tsx');
const accountManager = readSource('features/boss/pages/BossAccountManager.tsx');
const inboxWorkbench = readSource('features/boss/pages/BossInboxWorkbench.tsx');

assert.match(
  bossPage,
  /浏览器导入/,
  'BossPage should describe the actual browser-cookie account entry',
);

assert.doesNotMatch(
  `${bossPage}\n${inboxWorkbench}`,
  /扫码登录即用|请先扫码登录|扫码登录 \+/,
  'BossPage should not point users to removed QR/stoken flows',
);

assert.match(
  accountManager,
  /从浏览器导入 BOSS 账号/,
  'Boss account manager should keep the browser-cookie import path visible',
);
