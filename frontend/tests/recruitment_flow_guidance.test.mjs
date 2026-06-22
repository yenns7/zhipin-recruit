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
const interviewsPage = readSource('pages/InterviewsPage.tsx');
const nav = readSource('lib/nav.ts');
const demandsNav = readSource('features/demands/nav.ts');

assert.match(
  demandsNav,
  /label:\s*'招聘管理'/,
  'Recruitment management should remain as the pre-pipeline business module in the left navigation',
);

assert.match(
  nav,
  /label:\s*'候选人管道'/,
  'Candidate pipeline should be the main candidate-stage progression entry',
);

assert.match(
  nav,
  /label:\s*'面试工作台'/,
  'Interview navigation should be framed as an execution workbench, not a duplicate hiring pipeline',
);

assert.match(
  nav,
  /interviewer:\s*'我的面试'/,
  'Interviewers should see their personal interview inbox instead of a broad center module',
);

assert.doesNotMatch(
  nav,
  /label:\s*'(招聘流程|面试任务|面试中心)'/,
  'The top-level navigation should use the more mature candidate-pipeline and interview-workbench labels',
);

assert.match(
  jobsPage,
  /查看候选人管道/,
  'Job rows should expose the next step from a job into its candidate pipeline',
);

assert.match(
  jobMatchPage,
  /已加入流程/,
  'Joined match rows should clearly confirm that the candidate entered the pipeline',
);

assert.match(
  jobMatchPage,
  /去候选人管道查看/,
  'After joining from matching, the CTA should tell HR the next destination plainly',
);

assert.match(
  pipelinePage,
  /待筛选 → AI 初筛 → 业务反馈 → 面试中 → Offer → 已入职 \/ 淘汰沉淀/,
  'Pipeline page should explain the simplified MVP hiring path including business feedback ownership',
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
  /去面试工作台/,
  'Interview-stage candidate cards should point HR to the interview workbench for scheduling and feedback',
);

assert.match(
  candidateCard,
  /记录 Offer/,
  'Offer-stage candidate cards should use business wording that HR recognizes',
);

assert.match(
  interviewPage,
  /title=\{interviewTitle\}/,
  'Interview task page should use a role-aware title instead of a broad center label',
);

assert.match(
  interviewPage,
  /处理面试安排、待补反馈和面试记录/,
  'Interview task copy should focus on execution work, not another candidate pipeline',
);

assert.match(
  interviewsPage,
  /回面试工作台/,
  'The standalone AI interview entry should send users back to the interview workbench',
);
