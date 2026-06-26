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
const myInterviewsPanel = readSource('components/interviewRecords/MyInterviewsPanel.tsx');

assert.match(
  myInterviewsPanel,
  /onClick=\{\(\) => onStartFeedback\(item\)\}/,
  'My interviews feedback CTA should call the supplied feedback callback',
);

assert.match(
  interviewPage,
  /handleStartAssignmentFeedback/,
  'Interview page should handle feedback clicks from assignment cards',
);

assert.match(
  interviewPage,
  /setFocus\('pending'\)[\s\S]*setSelectedPending\(target\)/,
  'Assignment feedback click should switch to pending feedback and select the candidate',
);

assert.match(
  interviewPage,
  /feedbackFormRef/,
  'Interview page should keep a ref for the feedback form area',
);

assert.match(
  interviewPage,
  /scrollIntoView/,
  'Selecting feedback from the top cards should visibly move the user to the feedback form',
);

assert.match(
  interviewPage,
  /ref=\{feedbackFormRef\}/,
  'Feedback form card should expose the scroll target ref',
);

assert.match(
  interviewPage,
  /handleOpenAssignmentPanel/,
  'Header schedule button should use an explicit handler instead of silently opening a lower panel',
);

assert.match(
  interviewPage,
  /assignmentPanelRef/,
  'Interview page should keep a ref for the interview assignment panel',
);

assert.match(
  interviewPage,
  /ref=\{assignmentPanelRef\}/,
  'Interview assignment panel should expose the scroll target ref',
);
