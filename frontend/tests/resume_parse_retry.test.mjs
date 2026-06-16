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
assert.match(api, /updateCandidateProfile/, 'API client should expose manual candidate profile updates');
assert.match(api, /\/resume\/\$\{candidateId\}\/profile/, 'Profile update should call the backend profile endpoint');

const featureApi = readSource('features/candidates/api.ts');
assert.match(featureApi, /retryCandidateParse/, 'Candidate feature API should expose retry parse');
assert.match(featureApi, /updateCandidateProfile/, 'Candidate feature API should expose profile updates');

const profile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
assert.match(profile, /parse_status === 'failed'/, 'Profile page should show retry only for failed parsing');
assert.match(profile, /handleRetryParse/, 'Profile page should wire retry action');
assert.match(profile, /重新解析/, 'Profile page should label the retry action plainly');
assert.match(profile, /编辑档案/, 'Profile page should let HR edit parsed resume details');
assert.match(profile, /项目经历/, 'Profile page should expose project experience as a first-class resume section');
assert.match(profile, /handleSaveProfile/, 'Profile page should wire manual profile save');
