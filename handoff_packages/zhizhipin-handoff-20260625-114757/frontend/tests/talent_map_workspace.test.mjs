import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

async function importTsModule(path) {
  const source = readSource(path);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const tempDir = mkdtempSync(join(tmpdir(), 'talent-map-state-'));
  const tempFile = join(tempDir, 'module.mjs');
  writeFileSync(tempFile, output);
  return import(pathToFileURL(tempFile).href);
}

const app = readSource('App.tsx');
const tabs = readSource('components/recruitment/RecruitmentManagementTabs.tsx');
const demandsNav = readSource('features/demands/nav.ts');
const demandsFeature = readSource('features/demands/index.ts');
const api = readSource('lib/api.ts');
const types = readSource('types/index.ts');
assert.ok(
  existsSync(join(srcRoot, 'pages/TalentMapPage.tsx')),
  'Talent map page file should exist',
);
const page = readSource('pages/TalentMapPage.tsx');

assert.match(
  app,
  /path="\/talent-map"/,
  'Talent map should be available as a real authenticated route',
);

assert.match(
  app,
  /TalentMapPage/,
  'App router should render the talent map page',
);

assert.match(
  tabs,
  /to:\s*'\/talent-map'[\s\S]*label:\s*'人才地图'/,
  'Recruitment management tabs should include 人才地图',
);

assert.match(
  demandsNav,
  /activePaths:\s*\[[\s\S]*'\/talent-map'[\s\S]*\]/,
  '招聘管理 sidebar entry should stay active on the talent map page',
);

assert.match(
  demandsFeature,
  /topLevelPaths:\s*\[[\s\S]*'\/talent-map'[\s\S]*\]/,
  'Talent map should be treated as a top-level recruitment management page',
);

assert.match(types, /interface TalentMap\b/, 'Shared types should expose TalentMap');
assert.match(types, /interface TalentMapCompany\b/, 'Shared types should expose TalentMapCompany');
assert.match(types, /interface TalentMapPerson\b/, 'Shared types should expose TalentMapPerson');

for (const name of [
  'listTalentMaps',
  'createTalentMap',
  'getTalentMap',
  'updateTalentMap',
  'createTalentMapCompany',
  'createTalentMapPerson',
  'updateTalentMapPerson',
]) {
  assert.match(api, new RegExp(`${name}\\(`), `API client should expose ${name}`);
}

assert.match(page, /RecruitmentManagementTabs/, 'Talent map page should reuse recruitment tabs');
assert.match(page, /公司筛选/, 'Talent map page should let HR filter by company');
assert.match(page, /新增目标公司/, 'Talent map page should let HR add target companies');
assert.match(page, /新增潜在人选/, 'Talent map page should let HR add talent leads');
assert.match(
  page,
  /resolvedActiveMapId[\s\S]*api\.getTalentMap\(resolvedActiveMapId/,
  'Talent map detail requests should only use a resolved valid map id',
);
assert.match(
  page,
  /label:\s*'岗位列表'/,
  'Talent map errors should identify when the job list request fails',
);
assert.match(
  page,
  /label:\s*'人才地图列表'/,
  'Talent map errors should identify when the map list request fails',
);
assert.match(
  page,
  /label:\s*'人才地图详情'/,
  'Talent map errors should identify when the map detail request fails',
);
assert.match(
  page,
  /message=\{`\$\{errorState\.label\}：\$\{errorState\.error\.message\}`\}/,
  'Talent map should not display a bare Not Found without its request source',
);

for (const column of ['目标公司', '潜在人选', '重点关注', '已接触', '暂不合适']) {
  assert.match(page, new RegExp(column), `Talent map board should include the ${column} board area`);
}

const { parseTalentMapSelectValue, resolveActiveTalentMapId } =
  await importTsModule('pages/talentMapState.ts');

assert.equal(resolveActiveTalentMapId([], 12), null, 'Empty map list should not request details');
assert.equal(resolveActiveTalentMapId([{ id: 5 }], null), 5, 'First map should be selected by default');
assert.equal(
  resolveActiveTalentMapId([{ id: 5 }, { id: 9 }], 9),
  9,
  'Existing active map id should be kept',
);
assert.equal(
  resolveActiveTalentMapId([{ id: 5 }], 99),
  5,
  'Stale active map id should fall back to an existing map',
);
assert.equal(
  resolveActiveTalentMapId([], 'undefined'),
  null,
  'Stale hot-reload string ids should not produce detail requests',
);
assert.equal(parseTalentMapSelectValue(''), null, 'Blank select value should clear the active map');
assert.equal(
  parseTalentMapSelectValue('undefined'),
  null,
  'Invalid select value should not become a request id',
);
assert.equal(parseTalentMapSelectValue('12'), 12, 'Numeric select value should become a map id');
