import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const candidatesApi = readSource('features/candidates/api.ts');
const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');

assert.match(
  candidatesApi,
  /previewJobMatch:\s*api\.previewJobMatch/,
  'Candidate library should reuse the read-only job matching preview API',
);

assert.match(
  candidatesPage,
  /api\.previewJobMatch\(selectedJobId,\s*candidateIds\)/,
  'Candidate library should load match results after HR selects a target job',
);

assert.match(
  candidatesPage,
  /function JobFitSummary/,
  'Candidate rows should render a job-scoped fit summary instead of raw tags only',
);

assert.match(
  candidatesPage,
  /岗位匹配摘要/,
  'Candidate table should name the column by the selected job context',
);

assert.match(
  candidatesPage,
  /命中要求/,
  'Job fit summary should show matched requirements',
);

assert.match(
  candidatesPage,
  /欠缺/,
  'Job fit summary should show missing requirements',
);

assert.match(
  candidatesPage,
  /建议初筛|谨慎推进|暂不建议/,
  'Job fit summary should expose a simple recommendation for HR',
);
