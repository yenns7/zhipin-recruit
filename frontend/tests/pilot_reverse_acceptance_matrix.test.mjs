import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

function readRepo(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

const checklist = readRepo('docs/06_试点上线检查清单.md');
const workflowGuidance = readRepo('frontend/tests/workflow_empty_state_guidance.test.mjs');
const interviewerScope = readRepo('frontend/tests/interviewer_role_scope.test.mjs');
const pendingFeedbackPanel = readRepo('frontend/src/components/interviewRecords/PendingFeedbackPanel.tsx');
const interviewPage = readRepo('frontend/src/pages/InterviewListPage.tsx');
const interviewLoop = readRepo('backend/tests/test_interview_loop.py');
const batchPipeline = readRepo('backend/tests/test_job_match_batch_pipeline.py');
const biMetrics = readRepo('backend/tests/test_bi_metrics.py');

[
  '反向路径',
  '不同角色',
  '数据闭环',
  '脏数据',
  'BI 反查',
  '误操作恢复',
  '下拉框目标缺失',
  '重复点击/并发',
  '部署版本一致',
  '非技术用户理解',
].forEach((angle) => {
  assert.match(checklist, new RegExp(angle), `Pilot checklist should keep reverse acceptance angle: ${angle}`);
});

assert.match(
  checklist,
  /输出 P0\/P1\/P2 清单/,
  'Reverse acceptance should force prioritized P0/P1/P2 output instead of a vague pass/fail',
);

assert.match(
  workflowGuidance,
  /暂无可加入候选人[\s\S]*修正阶段[\s\S]*数据质量提醒[\s\S]*面试反馈跟进[\s\S]*部门协同情况/,
  'Workflow guidance tests should cover empty data, recovery, and BI management interpretation without a separate help entry',
);

assert.match(
  pendingFeedbackPanel,
  /canOpenPipeline[\s\S]*\/candidates\/\$\{item\.candidate_id\}/,
  'Interview workspace tests should keep interviewer links away from forbidden pipeline routes',
);

assert.match(
  interviewPage,
  /canOpenPipeline=\{!isInterviewer\}/,
  'Interview page should pass role-specific pipeline link permission into pending feedback cards',
);

assert.match(
  interviewerScope,
  /Candidate pipeline route should be role-gated away from interviewers/,
  'Role scope tests should keep interviewers out of the candidate pipeline route',
);

assert.match(
  interviewLoop,
  /test_create_assignment_rejects_inactive_interviewer[\s\S]*test_create_assignment_rejects_closed_job/,
  'Interview assignment tests should cover stale dropdown targets: inactive interviewers and closed jobs',
);

assert.match(
  batchPipeline,
  /skipped_existing/,
  'Batch pipeline tests should cover repeated add attempts instead of only the first successful add',
);

assert.match(
  biMetrics,
  /data_quality_warnings[\s\S]*interviewer_accountability/,
  'BI tests should cover data quality warnings and interviewer accountability, not only top-line totals',
);
