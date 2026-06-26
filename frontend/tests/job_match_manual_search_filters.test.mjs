import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const jobMatchPage = readSource('pages/JobMatchPage.tsx');

assert.match(
  jobMatchPage,
  /AI 推荐/,
  'Job match page should keep an AI recommendation view',
);

assert.match(
  jobMatchPage,
  /全部候选人/,
  'Job match page should let HR search the full candidate library when AI misses someone',
);

assert.match(
  jobMatchPage,
  /searchCandidates/,
  'Manual candidate lookup should use the existing candidate search API',
);

assert.match(
  jobMatchPage,
  /previewJobMatch/,
  'Manual lookup results should still show job fit preview for the current job',
);

assert.match(
  jobMatchPage,
  /搜索候选人/,
  'Job match page should expose a visible candidate search field',
);

assert.match(
  jobMatchPage,
  /姓名、公司、岗位、学校、技能或邮箱/,
  'Search placeholder should explain that HR can find a known person manually',
);

assert.match(
  jobMatchPage,
  /匹配度/,
  'Job match page should offer score filtering',
);

assert.match(
  jobMatchPage,
  /入需求流程状态/,
  'Job match page should filter already-joined and not-yet-joined candidates',
);

assert.match(
  jobMatchPage,
  /缺失技能/,
  'Job match page should let HR narrow candidates by missing skills',
);

assert.match(
  jobMatchPage,
  /匹配技能/,
  'Job match page should let HR narrow candidates by matched skills',
);

assert.match(
  jobMatchPage,
  /filteredResults/,
  'Batch selection should be based on the currently filtered result set',
);

assert.match(
  jobMatchPage,
  /人工补找/,
  'Manual search view should explain why a low-AI-ranked candidate may still be added',
);
