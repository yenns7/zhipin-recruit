import type { BiDepartmentAccountability, BiInterviewerAccountability } from '../../types';
import { Reveal, pct, safeNum } from './biMetrics';

export function InterviewerAccountabilityTable({
  interviewers,
}: {
  interviewers: BiInterviewerAccountability[];
}) {
  if (interviewers.length === 0) {
    return <p className="py-2 text-sm text-muted">暂无面试官数据</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              面试官
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              面试安排
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              通过 / 拒绝
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              通过率
            </th>
            <th className="whitespace-nowrap py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted">
              待补反馈
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.04} y={8}>
          {interviewers.map((item) => (
            <tr
              key={`${item.interviewer_id ?? 'unknown'}-${item.interviewer_name}`}
              className="border-b border-hairline-soft transition-colors hover:bg-surface-soft"
            >
              <td className="whitespace-nowrap py-3 pr-4 font-medium text-ink">
                {item.interviewer_name}
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-body">
                {safeNum(item.assigned_count)}
                <span className="ml-1 text-xs text-muted-soft">
                  已反馈 {safeNum(item.feedback_submitted)}
                </span>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                <span className="text-success-700">{safeNum(item.passed_count)}</span>
                <span className="mx-1 text-muted-soft">/</span>
                <span className="text-danger-700">{safeNum(item.rejected_count)}</span>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-body">
                {pct(safeNum(item.pass_rate))}
              </td>
              <td className="whitespace-nowrap py-3 tabular-nums">
                <span className={item.pending_feedback > 0 ? 'text-warning-700' : 'text-muted'}>
                  {safeNum(item.pending_feedback)}
                </span>
                <span className="ml-1 text-xs text-muted-soft">
                  超时 {safeNum(item.overdue_feedback)}
                </span>
              </td>
            </tr>
          ))}
        </Reveal>
      </table>
    </div>
  );
}

export function DepartmentAccountabilityTable({
  departments,
}: {
  departments: BiDepartmentAccountability[];
}) {
  if (departments.length === 0) {
    return <p className="py-2 text-sm text-muted">暂无用人部门数据</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              用人部门
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              面试安排
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              通过 / 拒绝
            </th>
            <th className="whitespace-nowrap py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted">
              待补反馈
            </th>
            <th className="whitespace-nowrap py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted">
              轮次明细
            </th>
          </tr>
        </thead>
        <Reveal as="tbody" stagger={0.04} y={8}>
          {departments.map((item) => (
            <tr
              key={item.department}
              className="border-b border-hairline-soft transition-colors hover:bg-surface-soft"
            >
              <td className="whitespace-nowrap py-3 pr-4 font-medium text-ink">
                {item.department}
                <div className="mt-0.5 text-xs text-muted-soft">
                  {safeNum(item.jobs_count)} 个岗位 · {safeNum(item.interviewers_count)} 位面试官
                </div>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-body">
                {safeNum(item.assigned_count)}
                <span className="ml-1 text-xs text-muted-soft">
                  已反馈 {safeNum(item.feedback_submitted)}
                </span>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                <span className="text-success-700">{safeNum(item.passed_count)}</span>
                <span className="mx-1 text-muted-soft">/</span>
                <span className="text-danger-700">{safeNum(item.rejected_count)}</span>
                <span className="ml-2 text-xs text-muted-soft">{pct(safeNum(item.pass_rate))}</span>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                <span className={item.pending_feedback > 0 ? 'text-warning-700' : 'text-muted'}>
                  {safeNum(item.pending_feedback)}
                </span>
                <span className="ml-1 text-xs text-muted-soft">
                  超时 {safeNum(item.overdue_feedback)}
                </span>
              </td>
              <td className="py-3">
                <div className="flex min-w-[220px] flex-wrap gap-1.5">
                  {item.rounds.slice(0, 4).map((round) => (
                    <span
                      key={`${item.department}-${round.round}`}
                      className="rounded-md bg-surface-soft px-2 py-1 text-xs tabular-nums text-body"
                    >
                      {round.round_label} {safeNum(round.passed_count)}/{safeNum(round.assigned_count)}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Reveal>
      </table>
    </div>
  );
}
