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

assert.match(
  page,
  /意向城市/,
  'Candidate profile editor should let HR directly edit the candidate intent city',
);

assert.match(
  page,
  /新增工作经历/,
  'Candidate profile editor should support adding structured work experience rows',
);

assert.match(
  page,
  /新增项目经历/,
  'Candidate profile editor should support adding structured project rows',
);

assert.match(
  page,
  /experienceItems|projectItems/,
  'Candidate profile editor should keep structured experience and project items instead of only line-based text blobs',
);
