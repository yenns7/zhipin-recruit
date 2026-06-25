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
const stages = readSource('lib/pipelineStages.ts');
const insights = readSource('lib/pipelineInsights.ts');
const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
const biPage = readSource('pages/BiPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');

assert.match(types, /'interview'/, 'PipelineStage should include the single MVP interview stage');
assert.match(stages, /key:\s*'interview'[\s\S]*label:\s*'面试中'/, 'Pipeline stages should expose 面试中 as the main flow stage');
assert.doesNotMatch(stages, /key:\s*'interview_first'/, 'Main pipeline stages should not expose 一面 as a primary stage');
assert.doesNotMatch(stages, /key:\s*'interview_second'/, 'Main pipeline stages should not expose 二面 as a primary stage');
assert.doesNotMatch(stages, /key:\s*'interview_final'/, 'Main pipeline stages should not expose 终面 as a primary stage');

assert.match(insights, /business_review:\s*'interview'/, 'Business feedback should advance into the generic interview stage');
assert.match(insights, /interview:\s*'offer'/, 'The main next step from 面试中 should be Offer');

assert.match(feedbackForm, /round_1/, 'Interview feedback should keep concrete round records outside the main pipeline');
assert.match(feedbackForm, /technical/, 'Interview feedback should support technical interview records');
assert.match(feedbackForm, /business/, 'Interview feedback should support business interview records');
assert.match(feedbackForm, /hr/, 'Interview feedback should support HR interview records');
assert.match(feedbackForm, /提交并推进 Offer/, 'Feedback form should let HR move to Offer when the interview outcome is ready');
assert.doesNotMatch(feedbackForm, /interview_second/, 'Feedback form should not force a passed first interview into a second interview');

assert.match(biPage, /推荐成功面试/, 'BI should show generic interview entry metrics');
assert.match(biPage, /面试通过/, 'BI should show generic interview pass metrics');
assert.doesNotMatch(biPage, /一面通过/, 'BI should not use fixed first-interview pass as a top-level KPI');
assert.doesNotMatch(biPage, /二面通过/, 'BI should not use fixed second-interview pass as a top-level KPI');

assert.match(
  pipelinePage,
  /待筛选 → AI 初筛 → 业务反馈 → 面试中 → Offer → 已入职 \/ 淘汰沉淀/,
  'Pipeline guidance should describe the simplified MVP main flow',
);
