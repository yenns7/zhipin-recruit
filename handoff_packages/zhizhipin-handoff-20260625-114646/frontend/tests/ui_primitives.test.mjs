import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

[
  'components/ui/Toast.tsx',
  'components/ui/ConfirmDialog.tsx',
  'components/ui/Pagination.tsx',
  'components/ui/Skeleton.tsx',
  'components/ui/Tooltip.tsx',
  'lib/useDebounce.ts',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const uiIndex = readSource('components/ui/index.ts');
[
  'ToastProvider',
  'useToast',
  'ConfirmDialog',
  'Pagination',
  'Skeleton',
  'TableSkeleton',
  'Tooltip',
].forEach((exportName) => {
  assert.match(uiIndex, new RegExp(exportName), `${exportName} should be exported from the UI barrel`);
});

const app = readSource('App.tsx');
assert.match(app, /ToastProvider/, 'App should mount ToastProvider once at the root');
assert.match(app, /<ToastProvider>\s*<BrowserRouter>/s, 'ToastProvider should wrap the router so every page can show feedback');

const toast = readSource('components/ui/Toast.tsx');
assert.match(toast, /aria-live="polite"/, 'Toast region should announce messages without interrupting screen readers');
assert.match(toast, /success:/, 'Toast API should expose success messages');
assert.match(toast, /error:/, 'Toast API should expose error messages');

const confirmDialog = readSource('components/ui/ConfirmDialog.tsx');
assert.match(confirmDialog, /role="dialog"/, 'ConfirmDialog should use dialog semantics');
assert.match(confirmDialog, /aria-modal="true"/, 'ConfirmDialog should mark the overlay as modal');
assert.match(confirmDialog, /Escape/, 'ConfirmDialog should support Escape to close');

const pagination = readSource('components/ui/Pagination.tsx');
assert.match(pagination, /aria-label="分页导航"/, 'Pagination should expose a Chinese navigation label');
assert.match(pagination, /ellipsis/, 'Pagination should collapse long page ranges with ellipsis');

const skeleton = readSource('components/ui/Skeleton.tsx');
assert.match(skeleton, /animate-shimmer/, 'Skeleton should use the existing shimmer animation');
assert.match(skeleton, /role="status"/, 'TableSkeleton should expose loading status to assistive tech');

const tooltip = readSource('components/ui/Tooltip.tsx');
assert.match(tooltip, /role="tooltip"/, 'Tooltip should use tooltip semantics');
assert.match(tooltip, /group-hover/, 'Tooltip should work without page-level state');

const debounce = readSource('lib/useDebounce.ts');
assert.match(debounce, /setTimeout/, 'useDebounce should delay value updates');
assert.match(debounce, /clearTimeout/, 'useDebounce should cancel stale updates');
