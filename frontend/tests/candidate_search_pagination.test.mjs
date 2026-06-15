import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const api = readSource('lib/api.ts');
assert.match(api, /CandidateListQuery/, 'API client should type candidate list query params');
assert.match(api, /CandidateListResponse/, 'API client should type paginated candidate response');
assert.match(api, /searchCandidates/, 'API client should expose a paginated candidate search method');
assert.match(api, /\/candidates\?/, 'Paginated search should call /candidates with query params');

const types = readSource('types/index.ts');
assert.match(types, /CandidateListQuery/, 'Candidate list query type should exist');
assert.match(types, /CandidateListResponse/, 'Candidate list response type should exist');

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidatesPage, /useDebounce/, 'Candidate page should debounce server search');
assert.match(candidatesPage, /searchCandidates/, 'Candidate page should use server-side search');
assert.match(candidatesPage, /Pagination/, 'Candidate page should render pagination controls');
assert.match(candidatesPage, /per_page:\s*20/, 'Candidate page should request a stable page size');
