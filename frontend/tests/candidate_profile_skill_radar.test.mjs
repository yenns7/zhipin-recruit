import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, '../src');

function readSource(path) {
  return readFileSync(join(srcRoot, path), 'utf8');
}

const candidateProfile = readSource('features/candidates/pages/CandidateProfilePage.tsx');

assert.match(
  candidateProfile,
  /const CORE_SKILL_LIMIT = 8/,
  'Candidate profile should cap the radar to a readable number of core skills',
);

assert.match(
  candidateProfile,
  /function getCoreSkillTags/,
  'Candidate profile should derive a focused core-skill list before rendering charts',
);

assert.match(
  candidateProfile,
  /getCoreSkillTags\(tags\)/,
  'Candidate profile should compute core skills from all parsed tags',
);

assert.match(
  candidateProfile,
  /<TagRadarChart tags=\{coreTags\}/,
  'Skill radar should render only core tags, not every parsed tag',
);

assert.match(
  candidateProfile,
  /核心 \{coreTags\.length\} \/ 共 \{tags\.length\} 个技能/,
  'Candidate profile header should explain that the radar is showing a focused subset',
);

assert.match(
  candidateProfile,
  /查看全部技能标签/,
  'Candidate profile should keep all parsed tags available on demand',
);
