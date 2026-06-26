import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');
const backendRoot = join(__dirname, '../../backend/app');

function readFrontend(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

function readBackend(path) {
  return readFileSync(join(backendRoot, path), 'utf8');
}

const uploadPage = readFrontend('pages/UploadPage.tsx');
const types = readFrontend('types/index.ts');
const candidateProfile = readFrontend('features/candidates/pages/CandidateProfilePage.tsx');
const candidatesPage = readFrontend('features/candidates/pages/CandidatesPage.tsx');
const resumeApi = readBackend('api/resume.py');
const candidatesApi = readBackend('api/candidates.py');

assert.match(
  uploadPage,
  /上传后会保存到简历库/,
  'Upload page should make library-only upload the single default behavior',
);

assert.match(
  uploadPage,
  /后续可在简历库筛选后再加入岗位流程/,
  'Upload page should move job assignment guidance to the resume library',
);

assert.doesNotMatch(
  uploadPage,
  /保存并加入岗位流程/,
  'Upload page should not expose the removed job-linked upload option',
);

assert.doesNotMatch(
  uploadPage,
  /关联岗位上传/,
  'Upload page should avoid the ambiguous "关联岗位上传" wording',
);

assert.match(
  uploadPage,
  /去简历库分配岗位/,
  'Upload result should guide users to the resume library for job assignment',
);

assert.doesNotMatch(
  uploadPage,
  /加入哪个岗位流程/,
  'Upload page should not ask users to choose a job during upload',
);

assert.doesNotMatch(
  uploadPage,
  /请选择要加入的岗位/,
  'Upload page should not include a target job placeholder',
);

assert.doesNotMatch(
  uploadPage,
  /target_job_id/,
  'Upload page should not send target_job_id from the simplified upload flow',
);

assert.doesNotMatch(
  uploadPage,
  /SegmentedControl/,
  'Upload page should not use a mode switch for upload handling',
);

assert.match(
  uploadPage,
  /useState\(false\)/,
  'Optional source information should be collapsed by default',
);

assert.match(
  uploadPage,
  /候选人来源/,
  'Source channel should be labeled as candidate source',
);

assert.match(
  uploadPage,
  /内推人 \/ 猎头联系人（选填）/,
  'Referrer field should explain who to enter in recruiting language',
);

assert.match(
  uploadPage,
  /本次上传备注（选填）/,
  'Upload note should be labeled as optional batch notes',
);

assert.doesNotMatch(
  uploadPage,
  /来源链接/,
  'Source link should not be part of the main upload form',
);

assert.doesNotMatch(
  uploadPage,
  /候选人主页或沟通链接/,
  'Upload page should not ask users for a low-priority source URL in the main flow',
);

assert.match(
  uploadPage,
  /用于后续统计哪个渠道更有效/,
  'Source helper copy should explain why the optional channel matters',
);

assert.match(
  uploadPage,
  /后续可在简历库筛选后再加入岗位流程/,
  'Upload page should explain the downstream path for library-only resumes',
);

assert.doesNotMatch(
  uploadPage,
  /const uploadMode/,
  'Upload page should not keep removed upload mode state',
);

assert.doesNotMatch(
  uploadPage,
  /uploadMode === 'job'/,
  'Upload page should not branch into a job-linked upload mode',
);

assert.doesNotMatch(
  uploadPage,
  /关联岗位上传需要先选择目标岗位/,
  'Validation copy should not reuse the ambiguous job-linked upload wording',
);

assert.doesNotMatch(
  uploadPage,
  /未选择目标岗位时不能上传/,
  'Upload page should not block library-only uploads with the old target-job message',
);

assert.doesNotMatch(
  uploadPage,
  /const canUpload = hasFiles && Boolean\(selectedJob\) && !uploading/,
  'Upload action should not require a selected job for library-only uploads',
);

assert.doesNotMatch(
  uploadPage,
  /selectedJob/,
  'Upload page should not derive job attribution during upload',
);

assert.match(
  types,
  /target_job_city/,
  'Candidate source info should include the city inherited from the target job',
);

assert.match(
  types,
  /target_job_department/,
  'Candidate source info should include the department inherited from the target job',
);

assert.match(
  types,
  /pipeline_stage\?:/,
  'Upload result should expose whether a parsed resume entered the pipeline',
);

assert.match(
  resumeApi,
  /target_job_city/,
  'Resume detail source payload should return target job city',
);

assert.match(
  candidatesApi,
  /target_job_department/,
  'Candidate list source payload should return target job department',
);

assert.match(
  candidateProfile,
  /岗位带出/,
  'Candidate profile should make clear that department attribution is inherited from the job',
);

assert.doesNotMatch(
  uploadPage,
  /查看流程/,
  'Upload result should not link directly to pipeline from the simplified upload flow',
);

assert.doesNotMatch(
  uploadPage,
  /已进入待筛选/,
  'Upload result should not show job-pipeline status from the simplified upload flow',
);

assert.doesNotMatch(
  uploadPage,
  /稍后分配岗位/,
  'Upload result should use clearer resume-library assignment wording',
);

assert.match(
  candidatesPage,
  /source\.target_job_department/,
  'Candidate list should surface the inherited department when present',
);
