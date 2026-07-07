import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

// Regression: docs/项目不足分析.md C5 — App had no global ErrorBoundary, so a
// chunk load failure on any of the 17 lazy routes produced a permanent white
// screen with no recovery affordance. This test locks in the fix.

assert.ok(
  existsSync(join(srcRoot, 'components/ui/ErrorBoundary.tsx')),
  'Shared ErrorBoundary component should exist'
);

const errorBoundary = readSource('components/ui/ErrorBoundary.tsx');
assert.match(
  errorBoundary,
  /getDerivedStateFromError/,
  'ErrorBoundary should implement getDerivedStateFromError'
);
assert.match(
  errorBoundary,
  /componentDidCatch/,
  'ErrorBoundary should implement componentDidCatch for logging'
);
assert.match(
  errorBoundary,
  /刷新页面/,
  'ErrorBoundary should offer a reload affordance so the user can recover'
);

const uiIndex = readSource('components/ui/index.ts');
assert.match(
  uiIndex,
  /export\s*\{\s*ErrorBoundary\s*\}\s*from\s*'\.\/ErrorBoundary'/,
  'ErrorBoundary should be exported from the ui barrel'
);

const app = readSource('App.tsx');
assert.match(
  app,
  /import\s*\{[^}]*ErrorBoundary[^}]*\}\s*from\s*'\.\/components\/ui'/,
  'App.tsx should import the shared ErrorBoundary'
);
assert.match(
  app,
  /<ErrorBoundary>[\s\S]*<AuthProvider>/,
  'ErrorBoundary should wrap the whole app so any route crash is caught'
);

// The BOSS page's former bespoke boundary should now delegate to the shared one
// instead of duplicating the same class (see H7 duplication finding).
const bossPage = readSource('features/boss/pages/BossPage.tsx');
assert.doesNotMatch(
  bossPage,
  /class\s+BossPageErrorBoundary/,
  'BossPage should no longer define its own duplicate ErrorBoundary class'
);
assert.match(
  bossPage,
  /ErrorBoundary/,
  'BossPage should reuse the shared ErrorBoundary'
);
