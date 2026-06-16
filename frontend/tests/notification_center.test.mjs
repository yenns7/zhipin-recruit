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
  existsSync(join(srcRoot, 'pages/NotificationCenterPage.tsx')),
  'Notification center page should exist',
);

const app = readSource('App.tsx');
assert.match(app, /NotificationCenterPage/, 'App should import the notification center');
assert.match(app, /path="\/notifications"/, 'App should expose the notifications route');

const nav = readSource('lib/nav.ts');
assert.doesNotMatch(nav, /label:\s*'通知中心'/, 'Notification center should not compete with primary HR workflow navigation');

const shell = readSource('components/AppShell.tsx');
assert.match(shell, /Bell/, 'Top bar should expose notification center as a utility');
assert.match(shell, /to="\/notifications"/, 'Top bar notification entry should link to the notification center');

const api = readSource('lib/api.ts');
assert.match(api, /getNotifications/, 'API client should list notifications');
assert.match(api, /getUnreadCount/, 'API client should fetch unread count');
assert.match(api, /markNotificationsRead/, 'API client should mark notifications read');

const types = readSource('types/index.ts');
assert.match(types, /NotificationItem/, 'Notification item type should exist');
assert.match(types, /NotificationListResponse/, 'Notification list response type should exist');
