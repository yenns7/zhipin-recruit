import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const agentPage = readSource('pages/AgentPage.tsx');
assert.doesNotMatch(
  agentPage,
  /自主决策/,
  'AI assistant copy should position AI as an assistant, not an autonomous decision maker',
);
assert.match(
  agentPage,
  /人工确认/,
  'AI assistant should make it clear that write actions need human confirmation',
);

const interviewsPage = readSource('pages/InterviewsPage.tsx');
assert.match(
  interviewsPage,
  /AI 预筛参考/,
  'AI interview page should frame the report as reference, not final judgement',
);
assert.match(
  interviewsPage,
  /手动安排面试/,
  'AI interview page should keep a visible manual interview path',
);

const interviewListPage = readSource('pages/InterviewListPage.tsx');
assert.match(
  interviewListPage,
  /AI 预筛参考/,
  'Interview center should use the same restrained AI wording',
);
assert.match(
  interviewListPage,
  /安排面试/,
  'Interview center should keep the manual scheduling path visible',
);

const guidePanel = readSource('components/interview/InterviewGuidePanel.tsx');
assert.match(
  guidePanel,
  /追问参考/,
  'Interview guide should be presented as a reference for the interviewer',
);

const feedbackForm = readSource('components/interview/FeedbackForm.tsx');
assert.match(
  feedbackForm,
  /人工反馈/,
  'Feedback form should make the human decision channel explicit',
);
