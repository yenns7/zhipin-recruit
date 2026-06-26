import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const types = readSource('types/index.ts');
const stageConfig = readSource('lib/pipelineStages.ts');
const candidateCard = readSource('components/pipeline/CandidateCard.tsx');
const dashboard = readSource('pages/DashboardPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');
const insights = readSource('lib/pipelineInsights.ts');

assert.match(types, /'business_review'/, 'PipelineStage should include business review');
assert.match(stageConfig, /key:\s*'business_review'/, 'Pipeline stages should define business review');
assert.match(stageConfig, /label:\s*'业务待反馈'/, 'Business review should use HR-facing wording');
assert.match(
  insights,
  /ai_screen:\s*'business_review'/,
  'AI screening should advance to business feedback before interviews',
);
assert.match(
  insights,
  /business_review:\s*'interview'/,
  'Business feedback should advance to the generic interview stage',
);
assert.match(
  dashboard,
  /business_feedback_overdue/,
  'Manager dashboard should understand business feedback overdue alerts',
);
assert.match(
  pipelinePage,
  /业务反馈/,
  'Pipeline page should explain the business feedback responsibility step',
);
assert.match(
  candidateCard,
  /停留/,
  'Pipeline candidate cards should show how long a candidate has stayed in the current stage',
);
assert.match(
  candidateCard,
  /stageAgeDays/,
  'Pipeline candidate cards should compute stage age from the latest stage update time',
);
