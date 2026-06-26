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
const page = readSource('features/candidates/pages/CandidateProfilePage.tsx');

assert.match(
  types,
  /rematched_jobs\?: \{ id: number; title: string \}\[\]/,
  'Candidate detail type should expose which jobs were refreshed after profile save',
);

assert.match(
  page,
  /rematched_jobs/,
  'Candidate profile page should read refreshed job information from the save response',
);

assert.match(
  page,
  /已同步刷新/,
  'Save success feedback should tell HR that downstream matching has been refreshed',
);
