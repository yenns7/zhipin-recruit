import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const uiIndex = readSource('components/ui/index.ts');
const toastProvider = readSource('components/ui/Toast.tsx');
assert.doesNotMatch(
  toastProvider,
  /export function useToast/,
  'Toast component file should only export components for React fast refresh',
);
assert.match(uiIndex, /useToast/, 'UI barrel should still export useToast for existing callers');

const demandsPage = readSource('features/demands/pages/DemandsPage.tsx');
assert.match(
  demandsPage,
  /const jobs = useMemo\(\(\) => jobsAsync\.data \?\? \[\], \[jobsAsync\.data\]\)/,
  'Demand page should memoize jobs fallback array to avoid unstable hook deps',
);
assert.match(
  demandsPage,
  /const demands = useMemo\(\(\) => demandsAsync\.data \?\? \[\], \[demandsAsync\.data\]\)/,
  'Demand page should memoize demands fallback array to avoid unstable hook deps',
);
