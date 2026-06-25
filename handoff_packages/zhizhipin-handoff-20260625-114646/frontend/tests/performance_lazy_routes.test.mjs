import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/App.tsx'), 'utf8');

assert.match(source, /lazy\(/, 'App should lazy-load route pages instead of bundling every page up front');
assert.match(source, /<Suspense/, 'Lazy routes should be wrapped in Suspense');

[
  'AgentPage',
  'BiPage',
  'TalentMapPage',
  'PipelinePage',
  'InterviewListPage',
  'InterviewsPage',
  'JobMatchPage',
].forEach((page) => {
  assert.match(
    source,
    new RegExp(`const ${page} = lazy\\(\\(\\) => import\\(`),
    `${page} should be loaded only when its route is visited`,
  );
});
