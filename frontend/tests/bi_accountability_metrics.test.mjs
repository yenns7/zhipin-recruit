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
  /面试官责任/,
  'BI page should show interviewer accountability',
);
assert.match(
  biPage,
  /用人部门责任/,
  'BI page should show department accountability',
);
assert.match(
  biPage,
  /待补反馈/,
  'BI accountability view should expose pending feedback',
);
