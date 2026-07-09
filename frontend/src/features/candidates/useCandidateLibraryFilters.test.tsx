import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CandidateListItem, MatchResultItem } from './types';
import { useCandidateLibraryFilters } from './useCandidateLibraryFilters';

const candidates: CandidateListItem[] = [
  {
    id: 1,
    nameMasked: '张三',
    ownerHrId: 7,
    createdAt: '2026-07-05T00:00:00Z',
    tagCount: 2,
    intentCity: '上海',
    topTags: [
      { tag: 'Python', score: 5 },
      { tag: 'AI', score: 4 },
    ],
    maxScore: 4,
    latestExperience: {
      company: '甲公司',
      position: '后端工程师',
      duration: '2年',
    },
  },
  {
    id: 2,
    nameMasked: '李四',
    ownerHrId: 8,
    createdAt: '2026-07-06T00:00:00Z',
    tagCount: 1,
    intentCity: '北京',
    topTags: [{ tag: 'Go', score: 5 }],
    maxScore: 5,
  },
];

const matchByCandidateId = new Map<number, MatchResultItem>([
  [
    1,
    {
      candidateId: 1,
      candidateName: '张三',
      score: 60,
      matchedRequiredSkills: ['Python'],
      missingRequiredSkills: [],
      matchedPreferredSkills: [],
      yearsOfExperience: null,
      summary: '',
    },
  ],
  [
    2,
    {
      candidateId: 2,
      candidateName: '李四',
      score: 92,
      matchedRequiredSkills: ['Go'],
      missingRequiredSkills: [],
      matchedPreferredSkills: [],
      yearsOfExperience: null,
      summary: '',
    },
  ],
]);

describe('useCandidateLibraryFilters', () => {
  it('derives filter options, counts, and active-filter state from candidates', () => {
    const { result } = renderHook(() =>
      useCandidateLibraryFilters({
        candidates,
        query: '',
        cityFilter: 'all',
        tagFilter: 'all',
        sourceChannelFilter: '内推',
        parseStatusFilter: 'all',
        pipelineStatusFilter: 'all',
        scoreFilter: '0',
        selectedJobId: 0,
        matchByCandidateId,
      }),
    );

    expect(result.current.cityOptions).toContain('上海');
    expect(result.current.cityOptions).toContain('北京');
    expect(result.current.tagOptions.map(([tag]) => tag)).toContain('Python');
    expect(result.current.sourceOptions).toContain('内推');
    expect(result.current.uniqueTagCount).toBe(3);
    expect(result.current.highScoreCount).toBe(2);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('sorts by selected job fit before local score/date when a target job is active', () => {
    const { result } = renderHook(() =>
      useCandidateLibraryFilters({
        candidates,
        query: '',
        cityFilter: 'all',
        tagFilter: 'all',
        sourceChannelFilter: 'all',
        parseStatusFilter: 'all',
        pipelineStatusFilter: 'all',
        scoreFilter: '0',
        selectedJobId: 11,
        matchByCandidateId,
      }),
    );

    expect(result.current.filteredCandidates.map((candidate) => candidate.id)).toEqual([2, 1]);
  });

  it('filters by city, tag, and minimum score together', () => {
    const { result } = renderHook(() =>
      useCandidateLibraryFilters({
        candidates,
        query: '',
        cityFilter: '上海',
        tagFilter: 'Python',
        sourceChannelFilter: 'all',
        parseStatusFilter: 'all',
        pipelineStatusFilter: 'all',
        scoreFilter: '4',
        selectedJobId: 0,
        matchByCandidateId,
      }),
    );

    expect(result.current.filteredCandidates.map((candidate) => candidate.id)).toEqual([1]);
  });
});
