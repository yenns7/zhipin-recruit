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
  existsSync(join(srcRoot, 'features/demands/index.ts')),
  'Demand management should live in its own sidebar feature module',
);

const registry = readSource('app/featureRegistry.ts');
assert.match(registry, /demandsFeature/, 'Feature registry should include demand management');

const nav = readSource('features/demands/nav.ts');
assert.match(nav, /label:\s*'需求管理'/, 'Demand feature should expose a sidebar entry');
assert.match(nav, /\/demands/, 'Demand nav should link to the demand list');

const routes = readSource('features/demands/routes.tsx');
assert.match(routes, /path:\s*'\/demands'/, 'Demand feature should register the list route');

const api = readSource('features/demands/api.ts');
assert.match(api, /listDemands/, 'Demand API wrapper should list demands');
assert.match(api, /createDemand/, 'Demand API wrapper should create demands');
assert.match(api, /closeDemand/, 'Demand API wrapper should close demands');
assert.match(api, /downgradeDemand/, 'Demand API wrapper should downgrade demand priority');

const types = readSource('types/index.ts');
assert.match(types, /interface RecruitmentDemand/, 'Shared types should expose RecruitmentDemand');
assert.match(types, /business_review_count/, 'Demand metrics should expose business feedback backlog');

const page = readSource('features/demands/pages/DemandsPage.tsx');
assert.match(page, /需求管理/, 'Demand page should be named plainly');
assert.match(page, /业务提需求时间/, 'Demand form should capture when business raised the request');
assert.match(page, /HR 接手时间/, 'Demand form should capture when HR accepted the request');
assert.match(page, /关闭需求/, 'Demand cards should support closing stale or invalid requests');
assert.match(page, /降级/, 'Demand cards should support priority downgrade');
assert.match(page, /业务侧卡点/, 'Demand cards should call out when the business side is blocking progress');
assert.match(page, /HR 侧卡点/, 'Demand cards should call out when HR-side action is missing');
assert.match(page, /阶段分布/, 'Demand cards should visualize the linked job pipeline distribution');
assert.match(page, /current_stage_counts/, 'Demand cards should use current pipeline stage counts for progress context');
assert.match(page, /hr_no_recommendation/, 'Demand cards should understand HR no-recommendation risk flags');
