import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const page = readSource('features/candidates/pages/CandidatesPage.tsx');

assert.match(page, /岗位匹配/, 'Top-right job action should be framed as job matching');
assert.doesNotMatch(page, /按岗位找候选人/, 'Top-right action should not duplicate the job filter wording');

assert.match(page, /目标岗位/, 'Job filter should be labeled as the target job');
assert.match(page, /不限制岗位/, 'Job filter should default to not restricting by job');
assert.doesNotMatch(page, /按岗位查看/, 'Job filter should not sound like a second page entry');
assert.doesNotMatch(page, /不按岗位筛选/, 'Job filter placeholder should use plainer wording');

assert.match(page, /高匹配候选人/, 'High-score metric should be framed as high-fit candidates');
assert.doesNotMatch(page, /当前页高分候选人/, 'High-score metric should not imply a confusing page-only KPI');

assert.match(page, /候选人列表/, 'Candidate table should be named by the object users are reviewing');
assert.doesNotMatch(page, /简历库列表/, 'Candidate table title should not repeat the page title');

assert.match(
  page,
  /调整搜索词、城市、来源、解析状态、入流程状态或技能条件后再查看/,
  'Empty state should mention the renamed filter',
);
