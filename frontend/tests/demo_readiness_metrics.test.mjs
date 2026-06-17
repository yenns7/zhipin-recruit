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
const types = readSource('types/index.ts');

assert.match(
  types,
  /interface BiDemandMetrics/,
  'BI overview should type the demand health metrics returned by the backend',
);
assert.match(
  types,
  /interface BiResumeMetrics/,
  'BI overview should type the resume consumption metrics returned by the backend',
);
assert.match(
  types,
  /demands:\s*BiDemandMetrics/,
  'BiOverview should expose demand health metrics',
);
assert.match(
  types,
  /resumes:\s*BiResumeMetrics/,
  'BiOverview should expose resume consumption metrics',
);
assert.match(
  biPage,
  /流程内入职占比/,
  'BI KPI copy should describe the bounded delivery-safe rate',
);
assert.match(
  biPage,
  /需求健康/,
  'BI page should surface demand health metrics from the database',
);
assert.match(
  biPage,
  /简历消化/,
  'BI page should surface resume consumption metrics from the database',
);
assert.match(
  biPage,
  /data\.demands\.active_total/,
  'BI page should render active demand counts from the backend',
);
assert.match(
  biPage,
  /data\.resumes\.pipeline_entry_rate/,
  'BI page should render resume pipeline entry rate from the backend',
);
assert.match(
  biPage,
  /当前流程人数/,
  'BI should avoid calling current-stage pipeline count resume total',
);
assert.match(
  biPage,
  /data\.funnel\.pipeline_total/,
  'BI should render the backend current pipeline total',
);

const biVisuals = readSource('components/bi/BiVisuals.tsx');
assert.doesNotMatch(
  biVisuals,
  /next\.value\s*\/\s*s\.value/,
  'Funnel labels should not show stage-to-stage conversion rates that can exceed 100%',
);
assert.match(
  biVisuals,
  /阶段占比/,
  'Funnel labels should explain the safer current-stage share',
);
assert.match(
  biVisuals,
  /\{clamped\.toFixed\(1\)\s*\+\s*'%'\}/,
  'Conversion ring should render the real percent before animation runs',
);

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
const animatedNumber = readSource('components/motion/AnimatedNumber.tsx');
assert.doesNotMatch(
  animatedNumber,
  /const obj = \{ n: 0 \}/,
  'Animated KPI numbers should not reset visible business metrics back to 0',
);
assert.match(
  animatedNumber,
  /parseDisplayedNumber/,
  'Animated KPI numbers should animate from the currently displayed value',
);

assert.match(
  candidatesPage,
  /简历总量[\s\S]{0,220}<AnimatedNumber value=\{totalCandidates\} \/>/,
  'Candidate total card should use the backend total, not the current page length',
);
assert.doesNotMatch(
  candidatesPage,
  /简历总量[\s\S]{0,220}<AnimatedNumber value=\{candidates\.length\} \/>/,
  'Candidate total card should not use the current page length',
);
assert.match(
  candidatesPage,
  /当前显示 \{filteredCandidates\.length\} \/ \{totalCandidates\} 份/,
  'Candidate list summary should compare visible rows with backend total',
);
