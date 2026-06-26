import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const biPage = readSource('pages/BiPage.tsx');

assert.doesNotMatch(
  biPage,
  /function BiDashboardHelp/,
  'BI page should not keep a separate dashboard reading-help component',
);

assert.doesNotMatch(
  biPage,
  /怎么看数据/,
  'BI header should not show the extra 怎么看数据 entry',
);

assert.match(
  biPage,
  /description="看团队招聘进度、卡点和协同跟进"/,
  'BI header should use one short business-facing sentence',
);

assert.doesNotMatch(
  biPage,
  /指标口径/,
  'BI header should not carry a metric-definition popover',
);

assert.doesNotMatch(
  biPage,
  /协同归属/,
  'BI header should not carry an ownership explainer popover',
);

assert.doesNotMatch(
  biPage,
  /面试官负责反馈闭环/,
  'Detailed interviewer ownership explainer should not sit in the BI header',
);

assert.doesNotMatch(
  biPage,
  /用人部门负责岗位协同/,
  'Detailed department ownership explainer should not sit in the BI header',
);

assert.doesNotMatch(
  biPage,
  /候选人负责人：算 HR 绩效|面试反馈人：算面试官责任|用人部门：按岗位部门聚合/,
  'BI guide should avoid stiff responsibility-accounting copy',
);

assert.doesNotMatch(
  biPage,
  /<BiDashboardHelp days=\{days\} \/>/,
  'BI page should not render a reading-help action in the dashboard header',
);

assert.doesNotMatch(
  biPage,
  /<details className="relative"/,
  'BI page should not use a collapsible details entry for dashboard help',
);

assert.doesNotMatch(
  biPage,
  /<details[^>]*open/,
  'BI help should be collapsed by default',
);

assert.doesNotMatch(
  biPage,
  /<BiReadingGuide days=\{days\} \/>|把这页当成一次团队复盘/,
  'BI page should not keep a large default reading guide above the KPI cards',
);

assert.doesNotMatch(
  biPage,
  /<MetricDefinitionStrip \/>[\s\S]*<ResponsibilityDefinitionCard \/>/,
  'BI page should not stack two bulky definition panels at the top',
);
