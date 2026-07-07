import { Badge, ErrorState } from '../ui';
import type { CandidateListItem, CandidateTag, MatchResultItem } from '../../features/candidates/types';

const TAG_TONES = ['accent', 'purple', 'teal', 'info', 'neutral'] as const;

export function candidateTags(candidate: CandidateListItem): CandidateTag[] {
  return Array.isArray(candidate.top_tags) ? candidate.top_tags : [];
}

function scoreTone(score: number) {
  if (score >= 5) return 'success';
  if (score >= 4) return 'accent';
  if (score >= 3) return 'warning';
  return 'neutral';
}

export function ScorePill({ score }: { score: number }) {
  if (!score) return <span className="text-muted-soft">—</span>;
  return <Badge tone={scoreTone(score)}>{score} 分</Badge>;
}

function fitRecommendation(score: number, missingCount: number) {
  if (score >= 75 && missingCount <= 1) {
    return { label: '建议初筛', tone: 'success' as const };
  }
  if (score >= 45) {
    return { label: '谨慎推进', tone: 'warning' as const };
  }
  return { label: '暂不建议', tone: 'neutral' as const };
}

function fitScoreTone(score: number) {
  if (score >= 75) return 'success';
  if (score >= 45) return 'warning';
  return 'neutral';
}

function SkillBadges({ candidate }: { candidate: CandidateListItem }) {
  const tags = candidateTags(candidate);
  if (tags.length === 0) return <span className="text-muted-soft">暂无标签</span>;

  const visibleTags = tags.slice(0, 3);
  const hiddenCount = Math.max((candidate.tag_count ?? tags.length) - visibleTags.length, 0);

  return (
    <div className="flex max-w-[360px] flex-wrap gap-1.5">
      {visibleTags.map((skill, index) => (
        <Badge key={`${skill.tag}-${skill.score}`} tone={TAG_TONES[index % TAG_TONES.length]}>
          {skill.tag} · {skill.score}
        </Badge>
      ))}
      {hiddenCount > 0 && <Badge tone="neutral">+{hiddenCount}</Badge>}
    </div>
  );
}

export interface CandidateJobFitSummaryProps {
  candidate: CandidateListItem;
  jobFit: MatchResultItem | null;
  hasTargetJob: boolean;
  loading: boolean;
  error: boolean;
}

export function CandidateJobFitSummary({
  candidate,
  jobFit,
  hasTargetJob,
  loading,
  error,
}: CandidateJobFitSummaryProps) {
  if (!hasTargetJob) {
    return <SkillBadges candidate={candidate} />;
  }

  if (loading) {
    return <span className="text-xs text-muted-soft">正在计算岗位匹配…</span>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <ErrorState className="px-3 py-2 text-xs" message="岗位匹配预览失败" />
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  if (!jobFit) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-muted-soft">暂无岗位匹配结果</span>
        <SkillBadges candidate={candidate} />
      </div>
    );
  }

  const matched = Array.isArray(jobFit.matched_tags) ? jobFit.matched_tags : [];
  const missing = Array.isArray(jobFit.missing_tags) ? jobFit.missing_tags : [];
  const recommendation = fitRecommendation(jobFit.score, missing.length);

  return (
    <div className="max-w-[460px] space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={fitScoreTone(jobFit.score)}>匹配 {jobFit.score}%</Badge>
        <Badge tone={recommendation.tone}>{recommendation.label}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {matched.length > 0 ? (
          matched.slice(0, 3).map((tag) => (
            <Badge key={`matched-${tag}`} tone="success">
              命中要求 · {tag}
            </Badge>
          ))
        ) : (
          <Badge tone="neutral">命中要求 · 暂无</Badge>
        )}
        {missing.slice(0, 2).map((tag) => (
          <Badge key={`missing-${tag}`} tone="warning">
            欠缺 · {tag}
          </Badge>
        ))}
        {missing.length > 2 && <Badge tone="neutral">欠缺 +{missing.length - 2}</Badge>}
      </div>
    </div>
  );
}
