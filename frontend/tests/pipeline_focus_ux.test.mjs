import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const pipelinePage = readSource('pages/PipelinePage.tsx');
const addToPipeline = readSource('components/pipeline/AddToPipeline.tsx');
const candidateList = readSource('components/pipeline/PipelineCandidateList.tsx');
const candidatePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');

assert.match(
  pipelinePage,
  /查看流程说明/,
  'Pipeline page should keep the full hiring path as a lightweight disclosure instead of a permanent banner',
);

assert.match(
  pipelinePage,
  /showAddToPipeline/,
  'Pipeline page should gate the add-candidate panel behind a local disclosure state',
);

assert.ok(
  pipelinePage.indexOf('添加候选人') !== -1 &&
    pipelinePage.indexOf('添加候选人') < pipelinePage.indexOf('<PipelineStageTabs'),
  'Pipeline page should expose adding candidates as a compact job-row action before the stage tabs',
);

assert.match(
  addToPipeline,
  /onClose\?:/,
  'Add-to-pipeline panel should be dismissible after it is opened from the compact action',
);

assert.doesNotMatch(
  candidateList,
  /\{stage\.label\}\s*·\s*\{candidates\.length\}/,
  'Candidate list header should avoid repeating the active stage label already shown in the stage tabs',
);

assert.doesNotMatch(
  candidateList,
  /stage\.badgeBg[\s\S]{0,240}\{stage\.label\}/,
  'Candidate list header should not render a duplicate active-stage badge beside the stage tabs',
);

assert.match(
  candidatePanel,
  /showCorrection/,
  'Candidate detail panel should keep correction state separate from the main next action',
);

assert.match(
  candidatePanel,
  /更多操作/,
  'Candidate detail panel should tuck low-frequency correction behind a more-actions disclosure',
);

assert.match(
  candidatePanel,
  /\{showCorrection && \(/,
  'Stage correction controls should be rendered only after the user opens the recovery action',
);
