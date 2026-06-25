import type { InterviewFiltersState } from '../../lib/interviewRecords';
import { INTERVIEW_ROUNDS } from '../../lib/interviewRecords';
import type { JobListItem } from '../../types';
import { Card, Input, Select } from '../ui';

interface InterviewFiltersProps {
  filters: InterviewFiltersState;
  jobs: JobListItem[];
  interviewers: Array<{ id: number; name: string }>;
  showInterviewerFilter: boolean;
  onChange: (next: InterviewFiltersState) => void;
}

export function InterviewFilters({
  filters,
  jobs,
  interviewers,
  showInterviewerFilter,
  onChange,
}: InterviewFiltersProps) {
  const update = <K extends keyof InterviewFiltersState>(
    key: K,
    value: InterviewFiltersState[K],
  ) => onChange({ ...filters, [key]: value });

  return (
    <Card className="px-4 py-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Input
          label="候选人 / 反馈"
          value={filters.query}
          placeholder="搜索候选人、岗位、备注"
          onChange={(e) => update('query', e.target.value)}
        />

        <Select
          label="岗位"
          value={String(filters.jobId)}
          onChange={(e) =>
            update('jobId', e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
        >
          <option value="all">全部岗位</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </Select>

        <Select
          label="轮次"
          value={filters.round}
          onChange={(e) => update('round', e.target.value as InterviewFiltersState['round'])}
        >
          <option value="all">全部轮次</option>
          {INTERVIEW_ROUNDS.map((round) => (
            <option key={round.key} value={round.key}>
              {round.label}
            </option>
          ))}
        </Select>

        <Select
          label="结果"
          value={filters.result}
          onChange={(e) => update('result', e.target.value as InterviewFiltersState['result'])}
        >
          <option value="all">全部结果</option>
          <option value="passed">通过</option>
          <option value="failed">不通过</option>
          <option value="empty">未填写</option>
        </Select>

        {showInterviewerFilter && (
          <Select
            label="面试官"
            value={String(filters.interviewerId)}
            onChange={(e) =>
              update(
                'interviewerId',
                e.target.value === 'all' ? 'all' : Number(e.target.value),
              )
            }
          >
            <option value="all">全部面试官</option>
            {interviewers.map((interviewer) => (
              <option key={interviewer.id} value={interviewer.id}>
                {interviewer.name}
              </option>
            ))}
          </Select>
        )}

        <Select
          label="时间"
          value={filters.range}
          onChange={(e) => update('range', e.target.value as InterviewFiltersState['range'])}
        >
          <option value="today">今天</option>
          <option value="7d">近 7 天</option>
          <option value="30d">近 30 天</option>
          <option value="all">全部时间</option>
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-soft hover:text-ink"
          onClick={() => onChange({ ...filters, type: 'all' })}
        >
          全部类型
        </button>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-soft hover:text-ink"
          onClick={() => onChange({ ...filters, type: 'feedback' })}
        >
          面试官反馈
        </button>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-soft hover:text-ink"
          onClick={() => onChange({ ...filters, type: 'ai' })}
        >
          AI 预筛
        </button>
      </div>
    </Card>
  );
}
