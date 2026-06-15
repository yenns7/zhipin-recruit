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
assert.match(types, /ParseStatus/, 'Shared types should define parse status');
assert.match(types, /RetryParseResponse/, 'Shared types should define retry response');
assert.match(types, /parse_status\??:\s*ParseStatus/, 'Candidate payloads should expose parse status');

const api = readSource('lib/api.ts');
assert.match(api, /retryCandidateParse/, 'API client should expose resume parse retry');
assert.match(api, /\/resume\/\$\{candidateId\}\/retry-parse/, 'Retry should call the backend retry endpoint');

const featureApi = readSource('features/candidates/api.ts');
assert.match(featureApi, /retryCandidateParse/, 'Candidate feature API should expose retry parse');

const profile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
assert.match(profile, /parse_status === 'failed'/, 'Profile page should show retry only for failed parsing');
assert.match(profile, /handleRetryParse/, 'Profile page should wire retry action');
assert.match(profile, /重新解析/, 'Profile page should label the retry action plainly');
