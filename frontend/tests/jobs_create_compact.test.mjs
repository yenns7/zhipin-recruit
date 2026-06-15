import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, '../src/pages/JobsPage.tsx'), 'utf8');

assert.match(
  source,
  /showCreateForm/,
  'JobsPage should keep the create-job form behind explicit state',
);

assert.match(
  source,
  /<PageHeader[\s\S]*actions=\{/,
  'JobsPage should expose create-job as a header action instead of a full-width default form',
);

assert.match(
  source,
  /新增岗位/,
  'JobsPage should keep a visible compact 新增岗位 button',
);

assert.match(
  source,
  /\{showCreateForm && \(/,
  'CreateJobForm should render only after the user clicks 新增岗位',
);

assert.match(
  source,
  /setShowCreateForm\(false\)/,
  'The create panel should be dismissible and close after creation',
);

assert.match(
  source,
  /城市/,
  'JobsPage should let HR set and filter job city',
);

assert.match(
  source,
  /部门/,
  'JobsPage should let HR set and filter job department',
);

assert.match(
  source,
  /岗位编号/,
  'JobsPage should show a business-facing job code separate from the system id',
);

assert.match(
  source,
  /filteredJobs/,
  'JobsPage should filter the job list by city and department before rendering',
);
