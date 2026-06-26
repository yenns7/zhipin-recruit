import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const biPage = readSource('pages/BiPage.tsx');
const types = readSource('types/index.ts');

assert.match(
  types,
  /interface BiInterviewerAccountability/,
  'BI should type interviewer accountability metrics',
);
assert.match(
  types,
  /interface BiDepartmentAccountability/,
  'BI should type department accountability metrics',
);
assert.match(
  types,
  /interviewer_accountability:\s*BiInterviewerAccountability\[\]/,
  'BiOverview should expose interviewer accountability rows',
);
assert.match(
  types,
  /department_accountability:\s*BiDepartmentAccountability\[\]/,
  'BiOverview should expose department accountability rows',
);
assert.match(
  biPage,
  /面试反馈跟进/,
  'BI page should frame interviewer accountability as feedback follow-up',
);
assert.match(
  biPage,
  /部门协同情况/,
  'BI page should frame department accountability as collaboration health',
);
assert.match(
  biPage,
  /待补反馈/,
  'BI accountability view should expose pending feedback',
);
assert.match(
  biPage,
  /不是用来简单排名面试官/,
  'Interviewer accountability should avoid a blame-oriented interpretation',
);
assert.match(
  biPage,
  /不是给部门贴标签/,
  'Department accountability should avoid a blame-oriented interpretation',
);
assert.doesNotMatch(
  biPage,
  /<CardTitle>面试官责任<\/CardTitle>|<CardTitle>用人部门责任<\/CardTitle>/,
  'BI accountability card titles should not use stiff responsibility labels',
);
