import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

[
  'components/pipeline/RejectionDispositionForm.tsx',
  'components/pipeline/OfferDrawer.tsx',
  'components/interviewRecords/InterviewAssignmentPanel.tsx',
  'components/interviewRecords/MyInterviewsPanel.tsx',
  'components/interview/InterviewGuidePanel.tsx',
  'components/candidate/DecisionSummaryPanel.tsx',
].forEach((path) => {
  assert.ok(existsSync(join(srcRoot, path)), `${path} should exist`);
});

const uploadPage = readSource('pages/UploadPage.tsx');
assert.match(uploadPage, /来源信息/);
assert.match(uploadPage, /source_channel/);
assert.match(uploadPage, /target_job_id/);
assert.match(uploadPage, /上传批次/);

const candidatesPage = readSource('features/candidates/pages/CandidatesPage.tsx');
assert.match(candidatesPage, /来源渠道/);
assert.match(candidatesPage, /目标岗位/);

const candidateProfile = readSource('features/candidates/pages/CandidateProfilePage.tsx');
assert.match(candidateProfile, /来源信息/);
assert.match(candidateProfile, /招聘进展/);

const candidateCard = readSource('components/pipeline/CandidateCard.tsx');
assert.match(candidateCard, /RejectionDispositionForm/);
assert.match(candidateCard, /OfferDrawer/);
assert.match(candidateCard, /Offer 信息/);

const api = readSource('lib/api.ts');
assert.match(api, /saveOfferRecord/);
assert.match(api, /getOfferRecord/);
assert.match(api, /createInterviewAssignment/);
assert.match(api, /listInterviewAssignments/);
assert.match(api, /listInterviewers/);
assert.match(api, /getInterviewGuide/);

const interviewPage = readSource('pages/InterviewListPage.tsx');
assert.match(interviewPage, /InterviewAssignmentPanel/);
assert.match(interviewPage, /MyInterviewsPanel/);
assert.match(interviewPage, /InterviewGuidePanel/);
assert.match(interviewPage, /api\.listInterviewAssignments/);

const assignmentPanel = readSource('components/interviewRecords/InterviewAssignmentPanel.tsx');
assert.match(assignmentPanel, /安排面试/);
assert.match(assignmentPanel, /面试官/);
assert.match(assignmentPanel, /会议链接/);

const myInterviewsPanel = readSource('components/interviewRecords/MyInterviewsPanel.tsx');
assert.match(myInterviewsPanel, /我的面试/);
assert.match(myInterviewsPanel, /超时待反馈/);

const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
assert.match(feedbackForm, /评价维度/);
assert.match(feedbackForm, /专业能力/);
assert.match(feedbackForm, /evaluation/);

const guidePanel = readSource('components/interview/InterviewGuidePanel.tsx');
assert.match(guidePanel, /追问参考/);
assert.match(guidePanel, /建议追问/);

const progress = readSource('components/candidate/PipelineProgress.tsx');
assert.match(progress, /DecisionSummaryPanel/);
assert.match(progress, /InterviewGuidePanel/);
