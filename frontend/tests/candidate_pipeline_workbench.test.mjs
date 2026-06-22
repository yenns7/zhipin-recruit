import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

[
  'components/pipeline/PipelineStageTabs.tsx',
  'components/pipeline/PipelineCandidateList.tsx',
  'components/pipeline/PipelineCandidatePanel.tsx',
  'lib/pipelineInsights.ts',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const pipelinePage = readSource('pages/PipelinePage.tsx');
const stageTabs = readSource('components/pipeline/PipelineStageTabs.tsx');
const candidateList = readSource('components/pipeline/PipelineCandidateList.tsx');
const candidatePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');
const insights = readSource('lib/pipelineInsights.ts');

assert.match(
  pipelinePage,
  /PipelineStageTabs/,
  'Candidate pipeline should use stage tabs instead of a long full-width kanban as the primary navigation',
);

assert.match(
  pipelinePage,
  /PipelineCandidateList/,
  'Candidate pipeline should show the selected stage as a focused candidate list',
);

assert.match(
  pipelinePage,
  /PipelineCandidatePanel/,
  'Candidate pipeline should keep candidate details and actions in a side panel',
);

assert.doesNotMatch(
  pipelinePage,
  /KanbanColumn/,
  'Candidate pipeline page should no longer render every stage as a long kanban column grid',
);

assert.match(
  stageTabs,
  /aria-label="候选人管道阶段"/,
  'Stage tabs should be accessible as the candidate-pipeline stage navigator',
);

assert.match(
  candidateList,
  /当前阶段候选人/,
  'Candidate list should clearly describe that it is showing the active stage only',
);

assert.match(
  candidatePanel,
  /AI 建议/,
  'Candidate detail panel should expose lightweight AI guidance',
);

assert.match(
  candidatePanel,
  /下一步动作/,
  'Candidate detail panel should keep the next action obvious',
);

assert.match(
  candidatePanel,
  /去面试工作台/,
  'Interview-stage actions should still send users to the interview workbench',
);

assert.match(
  candidatePanel,
  /记录 Offer/,
  'Offer-stage actions should still preserve offer recording',
);

assert.match(
  insights,
  /buildPipelineInsight/,
  'AI guidance should be rule-based from current pipeline data for the MVP',
);

assert.match(
  insights,
  /停留超过/,
  'Pipeline insight should flag long-stalled candidates without calling a new backend service',
);
