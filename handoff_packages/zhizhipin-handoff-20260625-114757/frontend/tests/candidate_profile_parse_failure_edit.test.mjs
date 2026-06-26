import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const page = readSource('features/candidates/pages/CandidateProfilePage.tsx');

assert.doesNotMatch(
  page,
  /disabled=\{parseFailed\}/,
  'When resume parsing fails, HR should still be able to open the manual profile editor',
);
