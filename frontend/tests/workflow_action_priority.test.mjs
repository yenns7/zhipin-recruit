import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const interviewPage = readSource('pages/InterviewListPage.tsx');
const assignmentPanel = readSource('components/interviewRecords/InterviewAssignmentPanel.tsx');
const pipelinePanel = readSource('components/pipeline/PipelineCandidatePanel.tsx');
const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');

assert.match(
  interviewPage,
  /assignmentPanelOpen/,
  'Interview workbench should expose arranging interviews as a page-level primary action',
);

assert.match(
  interviewPage,
  /useSearchParams/,
  'Interview workbench should read candidate/job query params from pipeline links',
);

assert.match(
  interviewPage,
  /requestedCandidateId/,
  'Interview workbench should auto-focus the candidate passed from the pipeline',
);

assert.ok(
  interviewPage.indexOf('安排面试') !== -1 &&
    interviewPage.indexOf('AI 预筛参考') !== -1 &&
    interviewPage.indexOf('安排面试') < interviewPage.indexOf('AI 预筛参考'),
  'Interview workbench should prioritize manual interview scheduling before AI pre-screening',
);

assert.match(
  assignmentPanel,
  /open\?: boolean/,
  'Interview assignment panel should support controlled opening from the page header',
);

assert.doesNotMatch(
  pipelinePanel,
  /FeedbackForm/,
  'Candidate pipeline detail should not embed the interview feedback form; feedback belongs in the interview workbench',
);

assert.doesNotMatch(
  pipelinePanel,
  /录入评分/,
  'Candidate pipeline detail should avoid a duplicate scoring CTA',
);

assert.match(
  candidatesPage,
  /岗位匹配/,
  'Resume library should label job matching as a distinct matching workflow',
);

assert.match(
  candidatesPage,
  /加入所选岗位流程/,
  'Resume library row action should make it clear the candidate joins the selected job pipeline',
);
