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
assert.match(api, /batchAddToPipeline/, 'API client should expose the duplicate-safe add-to-pipeline method');

const types = readSource('types/index.ts');
assert.match(types, /CandidateListQuery/, 'Candidate list query type should exist');
assert.match(types, /CandidateListResponse/, 'Candidate list response type should exist');
assert.match(types, /intent_city\?:\s*string/, 'Candidate list item should expose parsed intent city');
assert.match(types, /city\?:\s*string/, 'Candidate list query should support city filtering');
assert.match(types, /parse_status\?:\s*ParseStatus/, 'Candidate list query should support parse status filtering');
assert.match(types, /source_channel\?:\s*string/, 'Candidate list query should support source channel filtering');
assert.match(types, /pipeline_status\?:/, 'Candidate list query should support assignment status filtering');

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidatesPage, /useDebounce/, 'Candidate page should debounce server search');
assert.match(candidatesPage, /searchCandidates/, 'Candidate page should use server-side search');
assert.match(candidatesPage, /Pagination/, 'Candidate page should render pagination controls');
assert.match(candidatesPage, /per_page:\s*20/, 'Candidate page should request a stable page size');
assert.match(candidatesPage, /意向城市/, 'Candidate page should offer an intent city filter');
assert.match(candidatesPage, /cityFilter/, 'Candidate page should keep intent city filter state');
assert.match(candidatesPage, /intent_city/, 'Candidate page should display or search parsed intent city');
assert.match(
  candidatesPage,
  /city:\s*cityFilter === 'all' \? undefined : cityFilter/,
  'Candidate page should pass intent city to server search'
);
assert.match(candidatesPage, /解析状态/, 'Candidate page should offer a parse status filter');
assert.match(candidatesPage, /来源渠道/, 'Candidate page should offer a source channel filter');
assert.match(candidatesPage, /岗位流程/, 'Candidate page should offer an assignment status filter');
assert.match(
  candidatesPage,
  /pipeline_status:\s*pipelineStatusFilter === 'all' \? undefined : pipelineStatusFilter/,
  'Candidate page should pass assignment status to server search'
);
assert.match(candidatesPage, /listJobs/, 'Candidate page should load active jobs for downstream assignment');
assert.match(candidatesPage, /batchAddToPipeline/, 'Candidate page should add selected resumes to a job safely');
assert.match(candidatesPage, /加入岗位/, 'Candidate page should expose the action to add library resumes to a job');
