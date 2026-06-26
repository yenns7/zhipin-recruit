import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(join(__dirname, '../..'));

const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');

assert.doesNotMatch(
  gitignore,
  /!frontend\/dist\//,
  'frontend/dist should not be exempted from ignore rules',
);

const trackedDist = execFileSync(
  'git',
  ['-C', repoRoot, 'ls-files', 'frontend/dist'],
  { encoding: 'utf8' },
).trim();

assert.equal(
  trackedDist,
  '',
  'frontend/dist build artifacts should not be tracked by git',
);
