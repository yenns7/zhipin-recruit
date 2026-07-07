import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const sharedCities = readSource('lib/constants/cities.ts');
const jobsPage = readSource('pages/JobsPage.tsx');
const candidatesFilterHook = readSource('features/candidates/useCandidateLibraryFilters.ts');

assert.match(
  sharedCities,
  /export const COMMON_CITY_OPTIONS = \[/,
  'City presets should live in one shared constants module',
);

assert.match(
  jobsPage,
  /from '\.\.\/lib\/constants\/cities'/,
  'JobsPage should import shared city presets instead of defining its own list',
);
assert.doesNotMatch(
  jobsPage,
  /const COMMON_JOB_CITY_OPTIONS = \[/,
  'JobsPage should not keep a private city preset list',
);

assert.match(
  candidatesFilterHook,
  /from '\.\.\/\.\.\/lib\/constants\/cities'/,
  'CandidatesPage should import shared city presets instead of defining its own list',
);
assert.doesNotMatch(
  candidatesFilterHook,
  /const COMMON_CITY_OPTIONS = \[/,
  'CandidatesPage should not keep a private city preset list',
);
