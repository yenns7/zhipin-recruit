import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { CandidateJobFitSummary } from './CandidateJobFitSummary';
import type { CandidateListItem, MatchResultItem } from '../../features/candidates/types';

const candidate: CandidateListItem = {
  id: 17,
  nameMasked: '张**',
  ownerHrId: 3,
  createdAt: '2026-07-01T08:00:00Z',
  tagCount: 4,
  maxScore: 5,
  intentCity: '深圳',
  topTags: [
    { tag: 'React', score: 5 },
    { tag: 'TypeScript', score: 4 },
    { tag: '招聘系统', score: 4 },
  ],
};

const fit: MatchResultItem = {
  candidateId: 17,
  candidateName: '张**',
  score: 82,
  matchedRequiredSkills: ['React', 'TypeScript'],
  missingRequiredSkills: ['招聘流程'],
  matchedPreferredSkills: [],
  yearsOfExperience: null,
  summary: '',
};

describe('CandidateJobFitSummary', () => {
  it('renders job-scoped fit guidance when a target job is selected', () => {
    render(
      <CandidateJobFitSummary
        candidate={candidate}
        jobFit={fit}
        hasTargetJob
        loading={false}
        error={false}
      />
    );

    expect(screen.getByText('匹配 82%')).toBeInTheDocument();
    expect(screen.getByText('建议初筛')).toBeInTheDocument();
    expect(screen.getByText('命中要求 · React')).toBeInTheDocument();
    expect(screen.getByText('命中要求 · TypeScript')).toBeInTheDocument();
    expect(screen.getByText('欠缺 · 招聘流程')).toBeInTheDocument();
  });

  it('falls back to skill badges when no target job is selected', () => {
    render(
      <CandidateJobFitSummary
        candidate={candidate}
        jobFit={null}
        hasTargetJob={false}
        loading={false}
        error={false}
      />
    );

    expect(screen.getByText('React · 5')).toBeInTheDocument();
    expect(screen.getByText('TypeScript · 4')).toBeInTheDocument();
    expect(screen.queryByText(/匹配 82%/)).not.toBeInTheDocument();
  });

  it('uses the shared alert-style error state when job fit preview fails', () => {
    render(
      <CandidateJobFitSummary
        candidate={candidate}
        jobFit={null}
        hasTargetJob
        loading={false}
        error
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('岗位匹配预览失败');
    expect(screen.getByText('React · 5')).toBeInTheDocument();
  });
});
