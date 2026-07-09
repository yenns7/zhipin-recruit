import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const page = readSource('features/candidates/pages/CandidateProfilePage.tsx');

// Java 后端 Candidate 实体无 rematchedJobs 字段，简历保存后不再返回关联岗位刷新信息。
// 保留已同步刷新文案断言（页面仍可能显示保存成功提示）。
assert.match(
  page,
  /已同步刷新/,
  'Save success feedback should tell HR that downstream matching has been refreshed',
);
