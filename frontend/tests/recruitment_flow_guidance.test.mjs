import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const jobsPage = readSource('pages/JobsPage.tsx');
const jobMatchPage = readSource('pages/JobMatchPage.tsx');
const pipelinePage = readSource('pages/PipelinePage.tsx');
const candidateCard = readSource('components/pipeline/CandidateCard.tsx');
const interviewPage = readSource('pages/InterviewListPage.tsx');

assert.match(
  jobsPage,
  /查看招聘流程/,
  'Job rows should expose the next step from a job into its recruitment pipeline',
);

assert.match(
  jobMatchPage,
  /已加入流程/,
  'Joined match rows should clearly confirm that the candidate entered the pipeline',
);

assert.match(
  jobMatchPage,
  /去招聘流程查看/,
  'After joining from matching, the CTA should tell HR the next destination plainly',
);

assert.match(
  pipelinePage,
  /岗位 → 匹配候选人 → 加入流程 → AI 初筛 → 业务反馈 → 安排面试 → 面试反馈 → Offer \/ 淘汰沉淀/,
  'Pipeline page should explain the end-to-end hiring path including business feedback ownership',
);

assert.match(
  pipelinePage,
  /formatJobOption/,
  'Pipeline page should format job selector options with business identifiers',
);

assert.match(
  pipelinePage,
  /job\.job_code \|\| `JOB-\$\{job\.id\}`/,
  'Pipeline job selector should fall back to a visible JOB-id when no job code exists',
);

assert.match(
  candidateCard,
  /去面试中心/,
  'Interview-stage candidate cards should point HR to the interview center for scheduling and feedback',
);

assert.match(
  candidateCard,
  /记录 Offer/,
  'Offer-stage candidate cards should use business wording that HR recognizes',
);

assert.match(
  interviewPage,
  /安排面试、填写反馈、查看面试记录/,
  'Interview center copy should focus on scheduling and feedback, not another pipeline',
);

assert.match(
  interviewPage,
  /AI 初筛评估/,
  'The standalone AI interview entry should be named as AI screening evaluation',
);
