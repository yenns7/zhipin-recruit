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
const candidatePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');
const candidateCard = readSource('components/pipeline/CandidateCard.tsx');

assert.match(
  pipelinePage,
  /useToast/,
  'Pipeline moves should use the shared fixed Toast instead of inserting an in-page banner that shifts layout',
);

assert.doesNotMatch(
  pipelinePage,
  /const \[toast,\s*setToast\]/,
  'Pipeline page should not keep local in-page toast state that can push the workbench down',
);

assert.doesNotMatch(
  pipelinePage,
  /\{toast && \(/,
  'Pipeline page should not render a conditional in-flow toast above the workbench',
);

assert.match(
  pipelinePage,
  /pendingMove/,
  'Pipeline moves should preserve the current candidate while the board refreshes',
);

assert.match(
  pipelinePage,
  /if \(pendingMove\) \{\s*return;\s*\}/,
  'Auto-selection should pause during a pending move so the detail panel is not replaced mid-transition',
);

assert.doesNotMatch(
  pipelinePage,
  /boardAsync\.reload\(\);\s*setActiveStage\(toStage\)/,
  'Pipeline page should not switch stages immediately after triggering reload before fresh board data is available',
);

for (const [name, source] of [
  ['PipelineCandidatePanel', candidatePanel],
  ['CandidateCard', candidateCard],
]) {
  assert.doesNotMatch(
    source,
    /window\.prompt|prompt\(/,
    `${name} should not use browser-native prompt dialogs for move notes`,
  );
}

assert.match(
  candidatePanel,
  /变更备注（可选）/,
  'Candidate detail panel should collect optional move notes inline instead of using a browser prompt',
);
