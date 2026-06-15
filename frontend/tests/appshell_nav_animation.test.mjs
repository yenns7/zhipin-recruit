import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/components/AppShell.tsx'), 'utf8');

const navTweenStart = source.indexOf(".from(\n              '[data-shell=\"nav-item\"]'");
const navTweenEnd = source.indexOf("'-=0.2'", navTweenStart);
const navTweenBlock =
  navTweenStart >= 0 && navTweenEnd > navTweenStart
    ? source.slice(navTweenStart, navTweenEnd)
    : '';

assert.ok(navTweenBlock, 'AppShell should animate sidebar nav items explicitly');
assert.ok(
  !navTweenBlock.includes('autoAlpha'),
  'Sidebar nav animation must not use autoAlpha because it can leave links visibility:hidden',
);
assert.ok(
  source.includes("clearProps: 'opacity,visibility,transform'"),
  'Route changes should clear sidebar nav opacity, visibility, and transform leftovers',
);
