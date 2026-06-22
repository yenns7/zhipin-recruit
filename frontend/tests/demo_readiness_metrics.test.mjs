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
  /interface BiSourceQuality/,
  'BI overview should type source quality metrics for HR performance analysis',
);
assert.match(
  types,
  /interview_passed:\s*number/,
  'BI staff metrics should expose generic interview pass counts',
);
assert.match(
  types,
  /interview_to_offer_rate:\s*number/,
  'BI staff metrics should expose interview-to-offer conversion',
);
assert.doesNotMatch(
  types,
  /(?:first|second|final)_interview_(?:entries|feedbacks|passed|pass_rate|rate):\s*number/,
  'BI public types should not expose legacy fixed interview rounds',
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
  types,
  /source_quality:\s*BiSourceQuality\[\]/,
  'BiOverview should expose source quality metrics',
);
assert.match(
  types,
  /interface BiDataQualityWarning/,
  'BI overview should type data quality warning rows',
);
assert.match(
  types,
  /archived_total\?:\s*number/,
  'BI funnel should expose archived terminal-stage totals separately',
);
assert.match(
  types,
  /funnel_total\?:\s*number/,
  'BI funnel should expose the all-stage denominator for conversion rates',
);
assert.match(
  types,
  /scope\?:\s*'all'\s*\|\s*'owned_candidates'/,
  'Job BI detail should tell the frontend whether a recruiter sees all or owned-candidate scope',
);
assert.match(
  types,
  /data_quality_warnings:\s*BiDataQualityWarning\[\]/,
  'BiOverview should expose data quality warnings',
);
assert.match(
  biPage,
  /全流程入职占比/,
  'BI KPI copy should describe the full-funnel conversion denominator',
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
  /当前阶段分布 = 全量最新阶段，不受周期筛选影响/,
  'BI page should explain that current-stage funnel is a stock metric',
);
assert.match(
  biPage,
  /周期指标 = 按本期入库简历追踪后续结果/,
  'BI page should explain source and staff metrics use a resume cohort',
);
assert.match(
  biPage,
  /数据质量提醒/,
  'BI page should show data quality warnings from the backend',
);
assert.match(
  biPage,
  /data\.data_quality_warnings/,
  'BI page should render backend data quality warnings',
);
assert.match(
  biPage,
  /data\?\.data_quality_warnings\s*\?\?\s*\[\]/,
  'Staff drilldown should render staff-level data quality warnings',
);
assert.match(
  biPage,
  /sumStaff\(staff,\s*'onboarded'\)/,
  'Team average conversion should be weighted by onboarded count',
);
assert.match(
  biPage,
  /sumStaff\(staff,\s*'resumes'\)/,
  'Team average conversion should be weighted by resume count',
);
assert.match(
  biPage,
  /HR 绩效/,
  'BI page should expose a recruiter performance section',
);
assert.match(
  biPage,
  /推荐成功面试/,
  'BI page should render generic interview entry metrics',
);
assert.match(
  biPage,
  /面试通过/,
  'BI page should render generic interview pass metrics',
);
assert.match(
  biPage,
  /渠道质量/,
  'BI page should render source quality metrics',
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
