import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import { Reveal } from '../motion';
import { Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Badge, Pagination } from '../ui';
import { CandidateJobFitSummary, ScorePill } from './CandidateJobFitSummary';
import type { CandidateListItem, MatchResultItem, ParseStatus } from '../../features/candidates/types';

const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: '待解析',
  processing: '解析中',
  ok: '解析成功',
  failed: '解析失败',
};

function ParseStatusPill({ status }: { status?: ParseStatus }) {
  if (!status) return null;
  const tone = status === 'failed' ? 'danger' : status === 'ok' ? 'success' : 'warning';
  return <Badge tone={tone}>{PARSE_STATUS_LABELS[status]}</Badge>;
}

function ResumeSummary({ candidate }: { candidate: CandidateListItem }) {
  const exp = candidate.latestExperience;

  return (
    <div className="min-w-[220px] space-y-1">
      {exp?.company || exp?.position ? (
        <p className="font-medium text-ink">{[exp.position, exp.company].filter(Boolean).join(' · ')}</p>
      ) : (
        <p className="text-muted-soft">暂无工作经历</p>
      )}
      {exp?.duration && <p className="text-xs text-muted-soft">{exp.duration}</p>}
      {candidate.intentCity && <p className="text-xs text-muted">意向城市：{candidate.intentCity}</p>}
      {candidate.educationSummary && (
        <p className="text-xs text-muted">{candidate.educationSummary}</p>
      )}
    </div>
  );
}

function SourceSummary({ candidate }: { candidate: CandidateListItem }) {
  const source = candidate.source as Record<string, unknown> | null;

  if (!source) {
    return (
      <div className="space-y-2">
        <span className="text-muted-soft">未记录来源</span>
        <div>
          <ParseStatusPill status={candidate.parseStatus} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[160px] space-y-1 text-xs">
      <p className="font-medium text-ink">来源渠道：{String(source?.channel ?? '未填写')}</p>
      <p className="text-muted">目标岗位：{String(source?.targetJobTitle ?? '未关联')}</p>
      {(!!source?.targetJobCity || !!source?.targetJobDepartment) && (
        <p className="text-muted-soft">
          岗位归属：{String(source?.targetJobCity ?? '未设置')} / {String(source?.targetJobDepartment ?? '未设置')}
        </p>
      )}
      {!!source?.referrer && <p className="text-muted-soft">推荐人：{String(source?.referrer)}</p>}
      <div className="pt-1">
        <ParseStatusPill status={candidate.parseStatus} />
      </div>
    </div>
  );
}

interface CandidateRowProps {
  candidate: CandidateListItem;
  targetJobId: string;
  jobFit: MatchResultItem | null;
  jobFitLoading: boolean;
  jobFitError: boolean;
  addingCandidateId: number | null;
  onAddToJob: (candidateId: number) => void;
}

function CandidateRow({
  candidate,
  targetJobId,
  jobFit,
  jobFitLoading,
  jobFitError,
  addingCandidateId,
  onAddToJob,
}: CandidateRowProps) {
  const isAdding = addingCandidateId === candidate.id;

  return (
    <tr className="border-b border-hairline-soft transition-colors hover:bg-surface-soft last:border-0">
      <td className="px-5 py-4">
        <div className="min-w-[180px]">
          <Link to={`/candidates/${candidate.id}`} className="font-medium text-ink hover:underline">
            {candidate.nameMasked || `候选人 #${candidate.id}`}
          </Link>
          <div className="mt-1 space-y-0.5 text-xs text-muted-soft">
            {candidate.emailMasked && <p>{candidate.emailMasked}</p>}
            {candidate.phoneMasked && <p>{candidate.phoneMasked}</p>}
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-sm">
        <ResumeSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <CandidateJobFitSummary
          candidate={candidate}
          jobFit={jobFit}
          hasTargetJob={Boolean(targetJobId)}
          loading={jobFitLoading}
          error={jobFitError}
        />
      </td>
      <td className="px-5 py-4">
        <SourceSummary candidate={candidate} />
      </td>
      <td className="px-5 py-4">
        <ScorePill score={candidate.maxScore ?? 0} />
      </td>
      <td className="px-5 py-4 text-sm text-muted">{formatDate(candidate.createdAt)}</td>
      <td className="px-5 py-4 text-right">
        <div className="flex flex-col items-end gap-2">
          <Link
            to={`/candidates/${candidate.id}`}
            className="text-xs font-medium text-accent-blue transition-colors hover:underline"
          >
            查看完整简历
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isAdding}
            disabled={!targetJobId || isAdding}
            onClick={() => onAddToJob(candidate.id)}
          >
            <UserPlus className="h-4 w-4" />
            加入所选岗位流程
          </Button>
        </div>
      </td>
    </tr>
  );
}

export interface CandidateLibraryTableProps {
  filteredCandidates: CandidateListItem[];
  totalCandidates: number;
  targetJobId: string;
  matchByCandidateId: Map<number, MatchResultItem>;
  matchPreviewLoading: boolean;
  matchPreviewError: boolean;
  addingCandidateId: number | null;
  onAddToJob: (candidateId: number) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export function CandidateLibraryTable({
  filteredCandidates,
  totalCandidates,
  targetJobId,
  matchByCandidateId,
  matchPreviewLoading,
  matchPreviewError,
  addingCandidateId,
  onAddToJob,
  page,
  totalPages,
  onPageChange,
}: CandidateLibraryTableProps) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>候选人列表</CardTitle>
          <span className="text-xs text-muted-soft">
            当前显示 {filteredCandidates.length} / {totalCandidates} 份
          </span>
        </div>
      </CardHeader>
      {filteredCandidates.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={Users}
            title="没有符合条件的简历"
            description="调整搜索词、城市、来源、解析状态、入流程状态或技能条件后再查看"
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3">候选人</th>
                <th className="px-5 py-3">简历摘要</th>
                <th className="px-5 py-3">{targetJobId ? '岗位匹配摘要' : '核心技能'}</th>
                <th className="px-5 py-3">来源信息</th>
                <th className="px-5 py-3">最高分</th>
                <th className="px-5 py-3">入库时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <Reveal as="tbody" stagger={0.035} y={10}>
              {filteredCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  targetJobId={targetJobId}
                  jobFit={matchByCandidateId.get(candidate.id) ?? null}
                  jobFitLoading={Boolean(targetJobId && matchPreviewLoading)}
                  jobFitError={Boolean(targetJobId && matchPreviewError)}
                  addingCandidateId={addingCandidateId}
                  onAddToJob={onAddToJob}
                />
              ))}
            </Reveal>
          </table>
        </div>
      )}
      {page && totalPages && totalPages > 1 && onPageChange && (
        <div className="border-t border-hairline px-5 py-3">
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={onPageChange}
            summary={`第 ${page} / ${totalPages} 页，共 ${totalCandidates} 条`}
          />
        </div>
      )}
    </Card>
  );
}
