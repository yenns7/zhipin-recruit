import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CandidateListItem, MatchResultItem } from './types';
import { useCandidateLibraryFilters } from './useCandidateLibraryFilters';

const candidates: CandidateListItem[] = [
  {
    id: 1,
    name_masked: '张三',
    owner_hr_id: 7,
    created_at: '2026-07-05T00:00:00Z',
    tag_count: 2,
    intent_city: '上海',
    top_tags: [
      { tag: 'Python', score: 5 },
      { tag: 'AI', score: 4 },
    ],
    max_score: 4,
    latest_experience: {
      company: '甲公司',
      position: '后端工程师',
      duration: '2年',
    },
  },
  {
    id: 2,
    name_masked: '李四',
    owner_hr_id: 8,
    created_at: '2026-07-06T00:00:00Z',
    tag_count: 1,
    intent_city: '北京',
    top_tags: [{ tag: 'Go', score: 5 }],
    max_score: 5,
  },
];

const matchByCandidateId = new Map<number, MatchResultItem>([
  [
    1,
    {
      candidate_id: 1,
      name_masked: '张三',
      score: 60,
      matched_tags: ['Python'],
      missing_tags: [],
    },
  ],
  [
    2,
    {
      candidate_id: 2,
      name_masked: '李四',
      score: 92,
      matched_tags: ['Go'],
      missing_tags: [],
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
