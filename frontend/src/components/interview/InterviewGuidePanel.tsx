import { Lightbulb } from 'lucide-react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import type { InterviewGuide, InterviewRound } from '../../types';
import { Badge, Spinner } from '../ui';

interface InterviewGuidePanelProps {
  candidateId: number;
  jobId: number;
  round: InterviewRound;
}

export function InterviewGuidePanel({ candidateId, jobId, round }: InterviewGuidePanelProps) {
  const { data, loading, error } = useAsync<InterviewGuide>(
    () => api.getInterviewGuide(candidateId, jobId, round),
    [candidateId, jobId, round],
  );

  // Find the matching round data from the Java response.
  const currentRound = data?.rounds?.find((r) => r.round === round);

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">追问参考</p>
          <p className="mt-1 text-xs text-muted-soft">结合候选人标签和岗位要求生成，面试官可按现场情况取舍</p>
        </div>
        <Lightbulb className="h-4 w-4 text-warning-700" aria-hidden="true" />
      </div>

      {loading && (
        <div className="mt-3">
          <Spinner size="sm" />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger-600">{error.message}</p>}
      {data && currentRound && (
        <div className="mt-3 space-y-3">
          {currentRound.focusAreas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentRound.focusAreas.map((item) => (
                <Badge key={item} tone="accent">{item}</Badge>
              ))}
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">建议追问</p>
            <ol className="space-y-1.5">
              {currentRound.sampleQuestions.map((question, index) => (
                <li key={question} className="flex gap-2 text-sm text-body">
                  <span className="text-muted-soft">{index + 1}.</span>
                  <span>{question}</span>
                </li>
              ))}
            </ol>
          </div>
          {currentRound.riskFactors.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">核验点</p>
              <div className="flex flex-wrap gap-2">
                {currentRound.riskFactors.map((risk) => (
                  <Badge key={risk} tone="warning">{risk}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {data && !currentRound && (
        <p className="mt-3 text-sm text-muted-soft">该轮次暂无追问参考</p>
      )}
    </div>
  );
}
