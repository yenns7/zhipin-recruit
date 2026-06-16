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
  /入库方式/,
  'Upload page should let HR choose how the resumes enter the library',
);

assert.match(
  uploadPage,
  /上传到简历库/,
  'Upload page should support uploading resumes without binding a job first',
);

assert.match(
  uploadPage,
  /关联岗位上传/,
  'Upload page should keep the existing job-linked upload path',
);

assert.match(
  uploadPage,
  /后续可在简历库筛选后再加入岗位流程/,
  'Upload page should explain the downstream path for library-only resumes',
);

assert.match(
  uploadPage,
  /const uploadMode/,
  'Upload page should track whether this batch is library-only or job-linked',
);

assert.match(
  uploadPage,
  /uploadMode === 'job'/,
  'Upload page should only require a target job in job-linked mode',
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

assert.match(
  uploadPage,
  /selectedJob/,
  'Upload page should derive attribution preview from the selected target job',
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

assert.match(
  uploadPage,
  /已进入待筛选/,
  'Upload result should tell HR when job-linked uploads entered the pending pipeline',
);

assert.match(
  uploadPage,
  /查看流程/,
  'Upload result should link HR directly to the pipeline after job-linked import',
);

assert.match(
  uploadPage,
  /稍后分配岗位/,
  'Upload result should make library-only resumes easy to continue from the candidate library',
);

assert.match(
  candidatesPage,
  /source\.target_job_department/,
  'Candidate list should surface the inherited department when present',
);
