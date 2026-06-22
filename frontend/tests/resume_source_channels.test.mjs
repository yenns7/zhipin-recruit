import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const optionsPath = join(srcRoot, 'lib/sourceChannels.ts');
assert.ok(existsSync(optionsPath), 'Resume source channel options should be shared in lib/sourceChannels.ts');

const sourceChannels = readFileSync(optionsPath, 'utf8');
[
  'BOSS直聘',
  '58同城',
  '猎聘',
  '鱼泡直聘',
  '智联招聘',
  '前程无忧',
  '内推',
  '官网',
  'LinkedIn',
  '其他',
].forEach((channel) => {
  assert.match(sourceChannels, new RegExp(channel), `${channel} should be a standard resume source option`);
});

const uploadPage = readSource('pages/UploadPage.tsx');
assert.match(uploadPage, /RESUME_SOURCE_CHANNEL_OPTIONS/, 'Upload page should use standard source channel options');
assert.match(uploadPage, /候选人来源/, 'Upload page should present source channel in recruiting language');
assert.match(uploadPage, /自定义来源/, 'Upload page should keep a custom source escape hatch for other channels');
assert.doesNotMatch(
  uploadPage,
  /placeholder="例：BOSS直聘 \/ 猎聘 \/ 内推"/,
  'Upload page should no longer rely on free-text source examples',
);

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(
  candidatesPage,
  /RESUME_SOURCE_CHANNEL_OPTIONS/,
  'Candidate library source filter should reuse the same source channel options',
);
