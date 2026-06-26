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
  existsSync(join(srcRoot, 'pages/admin/AuditLogPage.tsx')),
  'Audit log page should exist',
);

const api = readSource('lib/api.ts');
assert.match(api, /getAuditLogs/, 'API client should expose getAuditLogs');
assert.match(api, /\/admin\/audit-logs/, 'API client should call the admin audit logs endpoint');

const types = readSource('types/index.ts');
assert.match(types, /AuditLogItem/, 'Audit log item type should exist');
assert.match(types, /AuditLogResponse/, 'Audit log response type should exist');
assert.match(types, /actor_role/, 'Audit log item should expose actor role');
assert.match(types, /request_id/, 'Audit log item should expose request id');
assert.match(types, /event_source/, 'Audit log item should expose event source');
assert.match(types, /severity/, 'Audit log item should expose severity');

const settings = readSource('pages/admin/SystemSettingsPage.tsx');
assert.match(settings, /AuditLogContent/, 'System settings should render audit log content');
assert.match(settings, /id:\s*'audit'/, 'Audit log should be a settings section');
assert.match(settings, /title:\s*'审计日志'/, 'Audit log section should be visible to admins');

const auditPage = readSource('pages/admin/AuditLogPage.tsx');
assert.match(auditPage, /request_id/, 'Audit log page should render request id');
assert.match(auditPage, /event_source/, 'Audit log page should render event source');
assert.match(auditPage, /severity[\s\S]*warning[\s\S]*danger/, 'Warning audit events should be highlighted');
