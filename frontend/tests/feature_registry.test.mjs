import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

assert.ok(
  existsSync(join(srcRoot, 'app/featureRegistry.ts')),
  'Feature registry should compose sidebar feature modules outside App.tsx',
);

const registry = readSource('app/featureRegistry.ts');
assert.match(
  registry,
  /candidatesFeature/,
  'Feature registry should include the candidates feature',
);

assert.ok(
  existsSync(join(srcRoot, 'features/candidates/index.ts')),
  'Candidates feature should expose an index.ts module',
);

const candidateIndex = readSource('features/candidates/index.ts');
assert.match(
  candidateIndex,
  /candidatesFeature/,
  'Candidates feature should export candidatesFeature',
);

const candidateRoutes = readSource('features/candidates/routes.tsx');
assert.match(candidateRoutes, /path:\s*'\/candidates'/);
assert.match(candidateRoutes, /path:\s*'\/candidates\/:id'/);

const candidateNav = readSource('features/candidates/nav.ts');
assert.match(candidateNav, /label:\s*'简历库'/);
