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
assert.match(nav, /label:\s*'招聘管理'/, 'Demand feature should expose the consolidated recruitment sidebar entry');
assert.match(nav, /\/demands/, 'Recruitment nav should still land on the demand list first');
assert.match(nav, /activePaths:\s*\[[\s\S]*'\/jobs'[\s\S]*\]/, 'Recruitment nav should stay active on job portrait pages');

const demandFeature = readSource('features/demands/index.ts');
assert.match(
  demandFeature,
  /topLevelPaths:\s*\[[\s\S]*'\/demands'[\s\S]*'\/jobs'[\s\S]*\]/,
  'Recruitment feature should treat both demand and job portrait pages as top-level pages',
);

const routes = readSource('features/demands/routes.tsx');
assert.match(routes, /path:\s*'\/demands'/, 'Demand feature should register the list route');

const api = readSource('features/demands/api.ts');
assert.match(api, /listDemands/, 'Demand API wrapper should list demands');
assert.match(api, /createDemand/, 'Demand API wrapper should create demands');
assert.match(api, /closeDemand/, 'Demand API wrapper should close demands');
assert.match(api, /downgradeDemand/, 'Demand API wrapper should downgrade demand priority');
assert.match(api, /restoreDemand/, 'Demand API wrapper should restore closed demands');

const types = readSource('types/index.ts');
assert.match(types, /interface RecruitmentDemand/, 'Shared types should expose RecruitmentDemand');
assert.match(types, /business_review_count/, 'Demand metrics should expose business feedback backlog');

const page = readSource('features/demands/pages/DemandsPage.tsx');
const recruitmentTabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
assert.match(page, /招聘管理/, 'Demand page should live under the consolidated recruitment management title');
assert.match(page, /RecruitmentManagementTabs/, 'Demand page should reuse the shared recruitment tabs');
assert.match(recruitmentTabs, /用人需求/, 'Recruitment tabs should expose the demand tab label');
assert.match(recruitmentTabs, /岗位画像/, 'Recruitment tabs should expose the job portrait tab label');
assert.match(page, /业务提需求时间/, 'Demand form should capture when business raised the request');
assert.match(page, /HR 接手时间/, 'Demand form should capture when HR accepted the request');
assert.match(page, /关闭需求/, 'Demand cards should support closing stale or invalid requests');
assert.match(page, /降级/, 'Demand cards should support priority downgrade');
assert.match(page, /调整优先级/, 'Demand cards should support correcting demand priority after mistakes');
assert.match(page, /恢复需求/, 'Demand cards should support restoring mistakenly closed demands');
assert.match(page, /业务侧卡点/, 'Demand cards should call out when the business side is blocking progress');
assert.match(page, /HR 侧卡点/, 'Demand cards should call out when HR-side action is missing');
assert.match(page, /阶段分布/, 'Demand cards should visualize the linked job pipeline distribution');
assert.match(page, /current_stage_counts/, 'Demand cards should use current pipeline stage counts for progress context');
assert.match(page, /hr_no_recommendation/, 'Demand cards should understand HR no-recommendation risk flags');
