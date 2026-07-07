import { useMemo } from 'react';
import { COMMON_CITY_OPTIONS } from '../../lib/constants/cities';
import { RESUME_SOURCE_CHANNEL_OPTIONS } from '../../lib/sourceChannels';
import { candidateTags } from '../../components/candidate/CandidateJobFitSummary';
import type { CandidateListItem, MatchResultItem, ParseStatus } from './types';

const COMMON_SOURCE_OPTIONS = RESUME_SOURCE_CHANNEL_OPTIONS.filter((channel) => channel !== '其他');

function searchableText(candidate: CandidateListItem): string {
  const exp = candidate.latest_experience;
  return [
    candidate.name_masked,
    candidate.email_masked,
    candidate.phone_masked,
    candidate.intent_city,
    candidate.education_summary,
    exp?.company,
    exp?.position,
    exp?.duration,
    ...candidateTags(candidate).map((tag) => tag.tag),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

interface UseCandidateLibraryFiltersArgs {
  candidates: CandidateListItem[];
  query: string;
  cityFilter: string;
  tagFilter: string;
  sourceChannelFilter: string;
  parseStatusFilter: 'all' | ParseStatus;
  pipelineStatusFilter: 'all' | 'in_pipeline' | 'not_in_pipeline';
  scoreFilter: string;
  selectedJobId: number;
  matchByCandidateId: Map<number, MatchResultItem>;
}

export function useCandidateLibraryFilters({
  candidates,
  query,
  cityFilter,
  tagFilter,
  sourceChannelFilter,
  parseStatusFilter,
  pipelineStatusFilter,
  scoreFilter,
  selectedJobId,
  matchByCandidateId,
}: UseCandidateLibraryFiltersArgs) {
  const cityOptions = useMemo(() => {
    const parsedCities = candidates
      .map((candidate) => candidate.intent_city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set([...COMMON_CITY_OPTIONS, ...parsedCities]));
  }, [candidates]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      for (const skill of candidateTags(candidate)) {
        counts.set(skill.tag, (counts.get(skill.tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 30);
  }, [candidates]);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>(COMMON_SOURCE_OPTIONS);
    if (sourceChannelFilter !== 'all') values.add(sourceChannelFilter);
    for (const candidate of candidates) {
      const channel = candidate.source?.channel?.trim();
      if (channel) values.add(channel);
    }
    return Array.from(values);
  }, [candidates, sourceChannelFilter]);

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minScore = Number(scoreFilter);
    return candidates
      .filter((candidate) => {
        const matchesQuery = !normalizedQuery || searchableText(candidate).includes(normalizedQuery);
        const matchesCity = cityFilter === 'all' || candidate.intent_city === cityFilter;
        const matchesTag =
          tagFilter === 'all' || candidateTags(candidate).some((skill) => skill.tag === tagFilter);
        const matchesScore = (candidate.max_score ?? 0) >= minScore;
        return matchesQuery && matchesCity && matchesTag && matchesScore;
      })
      .sort((a, b) => {
        if (selectedJobId) {
          const fitDiff = (matchByCandidateId.get(b.id)?.score ?? 0) - (matchByCandidateId.get(a.id)?.score ?? 0);
          if (fitDiff !== 0) return fitDiff;
        }
        const scoreDiff = (b.max_score ?? 0) - (a.max_score ?? 0);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [candidates, cityFilter, matchByCandidateId, query, scoreFilter, selectedJobId, tagFilter]);

  const uniqueTagCount = tagOptions.length;
  const highScoreCount = candidates.filter((candidate) => (candidate.max_score ?? 0) >= 4).length;
  const hasActiveFilters =
    query.trim() !== '' ||
    cityFilter !== 'all' ||
    tagFilter !== 'all' ||
    sourceChannelFilter !== 'all' ||
    parseStatusFilter !== 'all' ||
    pipelineStatusFilter !== 'all' ||
    scoreFilter !== '0';

  return {
    cityOptions,
    tagOptions,
    sourceOptions,
    filteredCandidates,
    uniqueTagCount,
    highScoreCount,
    hasActiveFilters,
  };
}
