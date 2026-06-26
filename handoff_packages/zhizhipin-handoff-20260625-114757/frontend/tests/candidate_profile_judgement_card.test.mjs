import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const candidateProfile = readSource('features/candidates/pages/CandidateProfilePage.tsx');

assert.match(
  candidateProfile,
  /function CandidateJudgementCard/,
  'Candidate profile should use a judgement card as the primary left-panel experience',
);

assert.match(
  candidateProfile,
  /候选人判断/,
  'The left panel should be framed around an HR decision, not a raw skill chart',
);

assert.match(
  candidateProfile,
  /推荐判断/,
  'The judgement card should expose a clear recommendation line',
);

assert.match(
  candidateProfile,
  /核心亮点/,
  'The judgement card should summarize top strengths before showing raw tags',
);

assert.match(
  candidateProfile,
  /待确认风险/,
  'The judgement card should make risk checks explicit',
);

assert.match(
  candidateProfile,
  /辅助雷达/,
  'The old radar should be downgraded to an auxiliary visualization',
);

assert.doesNotMatch(
  candidateProfile,
  /<CardTitle>\{useRadar \? '技能雷达' : '技能评分'\}<\/CardTitle>/,
  'Skill radar should no longer be the primary card title',
);
