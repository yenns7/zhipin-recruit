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
const pipelinePage = readSource('pages/PipelinePage.tsx');
const kanbanColumn = readSource('components/pipeline/KanbanColumn.tsx');
const candidateCard = readSource('components/pipeline/CandidateCard.tsx');

assert.match(
  jobMatchPage,
  /to=\{`\/pipeline\?job=\$\{jobId\}&candidate=\$\{item\.candidate_id\}`\}/,
  'Joined match rows should link directly to the pipeline board for the same job and candidate',
);

assert.match(
  jobMatchPage,
  /查看候选人需求流程/,
  'After joining a candidate, the match page should expose a visible next-step CTA',
);

assert.match(
  jobMatchPage,
  /加入该需求流程/,
  'Match page should describe the add action as joining the current recruitment demand workflow',
);

assert.match(
  jobMatchPage,
  /api\.getPipelineBoard\(jobId\)/,
  'Match page should load the current job pipeline so joined state survives refresh and back navigation',
);

assert.match(
  jobMatchPage,
  /existingPipelineIds\.has\(item\.candidate_id\)/,
  'Match rows should treat candidates already in the job pipeline as joined',
);

assert.match(
  pipelinePage,
  /useSearchParams/,
  'Pipeline page should read URL params so deep links can select the relevant job',
);

assert.match(
  pipelinePage,
  /searchParams\.get\('candidate'\)/,
  'Pipeline page should read the candidate param for recently joined candidate context',
);

assert.match(
  kanbanColumn,
  /highlightedCandidateId/,
  'Kanban columns should pass highlighted candidate context down to cards',
);

assert.match(
  candidateCard,
  /ring-2/,
  'Candidate cards should visually highlight the deep-linked candidate',
);
