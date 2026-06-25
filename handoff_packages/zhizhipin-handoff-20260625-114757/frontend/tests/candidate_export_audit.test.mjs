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
assert.match(api, /exportCandidate/, 'API client should expose candidate export');
assert.match(api, /\/candidates\/\$\{candidateId\}\/export/, 'API client should call candidate export endpoint');
assert.match(api, /res\.blob\(\)/, 'Candidate export should download CSV as a blob, not parse it as JSON');

const featureApi = readSource('features/candidates/api.ts');
assert.match(featureApi, /exportCandidate/, 'Candidate feature API should re-export candidate export');

const profile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
assert.match(profile, /handleExportCandidate/, 'Candidate profile should define an export handler');
assert.match(profile, /导出简历/, 'Candidate profile should show a resume export button');
