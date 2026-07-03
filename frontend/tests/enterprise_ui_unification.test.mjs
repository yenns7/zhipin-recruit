import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

assert.ok(
  existsSync(join(srcRoot, 'components/enterprise/index.tsx')),
  'Enterprise UI components should centralize the duplicated admin layout patterns',
);

const enterprise = readSource('components/enterprise/index.tsx');
[
  'EnterprisePage',
  'EnterpriseHero',
  'EnterpriseSearchPanel',
  'EnterpriseTableCard',
  'EnterpriseEmptyState',
  'EnterpriseDetailPanel',
  'EnterpriseDescriptionSection',
].forEach((component) => {
  assert.match(
    enterprise,
    new RegExp(`export function ${component}`),
    `${component} should be exported as a shared enterprise admin component`,
  );
});

const styles = readSource('index.css');
[
  '.enterprise-shell',
  '.enterprise-sidebar',
  '.enterprise-tabs',
  '.enterprise-hero',
  '.enterprise-search-panel',
  '.enterprise-table',
  '.enterprise-section-title',
  '.enterprise-empty-state',
].forEach((selector) => {
  assert.ok(styles.includes(selector), `${selector} should exist in the shared stylesheet`);
});

const shell = readSource('components/AppShell.tsx');
assert.match(shell, /enterprise-shell/, 'AppShell should use the enterprise admin shell');
assert.match(shell, /enterprise-sidebar/, 'AppShell should render the enterprise sidebar');
assert.match(shell, /enterprise-tabs/, 'AppShell should expose the top tab strip from the reference admin UI');
assert.match(shell, /主数据系统式/, 'AppShell should document the reference admin style in user-facing context');

const candidates = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidates, /EnterprisePage/, 'Candidate library should use the shared enterprise page wrapper');
assert.match(candidates, /EnterpriseSearchPanel/, 'Candidate library filters should use the unified search panel');
assert.match(candidates, /EnterpriseTableCard/, 'Candidate library table should use the unified table card');
assert.match(candidates, /EnterpriseEmptyState/, 'Candidate library empty states should use the unified empty state');
assert.match(candidates, /enterprise-table/, 'Candidate library should render the shared enterprise table class');

const jobs = readSource('pages/JobsPage.tsx');
assert.match(jobs, /EnterprisePage/, 'Job management should use the shared enterprise page wrapper');
assert.match(jobs, /EnterpriseSearchPanel/, 'Job management filters should use the unified search panel');
assert.match(jobs, /EnterpriseTableCard/, 'Job management table should use the unified table card');
assert.match(jobs, /EnterpriseDetailPanel/, 'Job management should include a unified right-side detail panel');
assert.match(jobs, /EnterpriseDescriptionSection/, 'Job detail should use unified description sections');
