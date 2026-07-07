import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { formatDate } from '../../lib/formatDate';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Spinner } from '../ui';
import { Reveal } from '../motion';
import type { JobListItem } from '../../types';

export type JobStatusFilter = 'active' | 'closed';

export interface JobAttributionDraft {
  city: string;
  department: string;
  job_code: string;
}

export interface JobsListPanelProps {
  loading: boolean;
  error: Error | null;
  reload: () => void;
  jobs: JobListItem[];
  filteredJobs: JobListItem[];
  hasActiveFilters: boolean;
  cityFilter: string;
  departmentFilter: string;
  cityOptions: string[];
  departmentOptions: string[];
  jobStatus: JobStatusFilter;
  editingJobId: number | null;
  editDraft: JobAttributionDraft;
  savingJobId: number | null;
  closingId: number | null;
  restoringId: number | null;
  onCityFilterChange: (value: string) => void;
  onDepartmentFilterChange: (value: string) => void;
  onJobStatusChange: (value: JobStatusFilter) => void;
  onEditDraftChange: (patch: Partial<JobAttributionDraft>) => void;
  onStartEditJobAttribution: (job: JobListItem) => void;
  onCancelEditJobAttribution: () => void;
  onSaveJobAttribution: (job: JobListItem) => void;
  onCloseJob: (jobId: number, title: string) => void;
  onRestoreJob: (jobId: number, title: string) => void;
}

export function JobsListPanel({
  loading,
  error,
  reload,
  jobs,
  filteredJobs,
  hasActiveFilters,
  cityFilter,
  departmentFilter,
  cityOptions,
  departmentOptions,
  jobStatus,
  editingJobId,
  editDraft,
  savingJobId,
  closingId,
  restoringId,
  onCityFilterChange,
  onDepartmentFilterChange,
  onJobStatusChange,
  onEditDraftChange,
  onStartEditJobAttribution,
  onCancelEditJobAttribution,
  onSaveJobAttribution,
  onCloseJob,
  onRestoreJob,
}: JobsListPanelProps) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>岗位列表</CardTitle>
            {!loading && (
              <p className="mt-1 text-xs text-muted-soft">
                {hasActiveFilters
                  ? `筛选后 ${filteredJobs.length} 个 / 共 ${jobs.length} 个岗位`
                  : `共 ${jobs.length} 个岗位`}
              </p>
            )}
          </div>
          {!loading && jobs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={cityFilter}
                onChange={(event) => onCityFilterChange(event.target.value)}
                className="h-9 rounded-md border border-hairline bg-canvas px-3 text-xs font-medium text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                aria-label="按城市筛选岗位"
              >
                <option value="">全部城市</option>
                {cityOptions.map((cityName) => (
                  <option key={cityName} value={cityName}>
                    {cityName}
                  </option>
                ))}
              </select>
              <select
                value={departmentFilter}
                onChange={(event) => onDepartmentFilterChange(event.target.value)}
                className="h-9 rounded-md border border-hairline bg-canvas px-3 text-xs font-medium text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                aria-label="按部门筛选岗位"
              >
                <option value="">全部部门</option>
                {departmentOptions.map((departmentName) => (
                  <option key={departmentName} value={departmentName}>
                    {departmentName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!loading && !error && (
            <div className="flex rounded-md border border-hairline bg-canvas p-1">
              {([
                ['active', '在招岗位'],
                ['closed', '已关闭岗位'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onJobStatusChange(value)}
                  className={[
                    'h-8 rounded px-3 text-xs font-semibold transition-colors',
                    jobStatus === value
                      ? 'bg-ink text-canvas'
                      : 'text-muted hover:bg-surface-soft hover:text-ink',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      {loading ? (
        <CardBody className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </CardBody>
      ) : error ? (
        <CardBody>
          <ErrorState message={error.message} onRetry={reload} />
        </CardBody>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={jobStatus === 'active' ? '暂无在招岗位' : '暂无已关闭岗位'}
          description={
            jobStatus === 'active'
              ? '点击右上角「新增岗位」创建第一个招聘岗位'
              : '已关闭岗位会保留在这里，误关闭时可恢复在招'
          }
        />
      ) : filteredJobs.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={Briefcase}
            title="没有符合筛选条件的岗位"
            description="切换城市或部门筛选后再查看"
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline-soft bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3">岗位编号</th>
                <th className="px-5 py-3">岗位名称</th>
                <th className="px-5 py-3">城市</th>
                <th className="px-5 py-3">部门</th>
                <th className="px-5 py-3">创建时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <Reveal as="tbody" className="divide-y divide-hairline-soft" stagger={0.05} y={12}>
              {filteredJobs.map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-surface-soft">
                  <td className="px-5 py-3.5">
                    {editingJobId === job.id ? (
                      <input
                        value={editDraft.job_code}
                        onChange={(event) => onEditDraftChange({ job_code: event.target.value })}
                        aria-label="编辑岗位编号"
                        className="h-8 w-28 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:border-ink focus:outline-none"
                        placeholder={`JOB-${job.id}`}
                      />
                    ) : (
                      <span className="font-mono text-xs text-muted">
                        {job.job_code || `JOB-${job.id}`}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">{job.title}</span>
                  </td>
                  <td className="px-5 py-3.5 text-muted">
                    {editingJobId === job.id ? (
                      <input
                        value={editDraft.city}
                        onChange={(event) => onEditDraftChange({ city: event.target.value })}
                        aria-label="编辑岗位城市"
                        className="h-8 w-24 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:border-ink focus:outline-none"
                        placeholder="城市"
                      />
                    ) : (
                      job.city || '未设置'
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted">
                    {editingJobId === job.id ? (
                      <input
                        value={editDraft.department}
                        onChange={(event) =>
                          onEditDraftChange({ department: event.target.value })
                        }
                        aria-label="编辑岗位部门"
                        className="h-8 w-28 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:border-ink focus:outline-none"
                        placeholder="部门"
                      />
                    ) : (
                      job.department || '未设置'
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted">{formatDate(job.created_at)}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {editingJobId === job.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onSaveJobAttribution(job)}
                            disabled={savingJobId === job.id}
                            className="text-xs font-medium text-ink hover:text-body hover:underline disabled:opacity-50"
                          >
                            {savingJobId === job.id ? '保存中…' : '保存归属'}
                          </button>
                          <button
                            type="button"
                            onClick={onCancelEditJobAttribution}
                            disabled={savingJobId === job.id}
                            className="text-xs font-medium text-muted hover:text-ink hover:underline disabled:opacity-50"
                          >
                            取消
                          </button>
                        </>
                      ) : job.status === 'closed' ? (
                        <button
                          type="button"
                          onClick={() => onRestoreJob(job.id, job.title)}
                          disabled={restoringId === job.id}
                          className="text-xs font-medium text-ink hover:text-body hover:underline disabled:opacity-50"
                        >
                          {restoringId === job.id ? '恢复中…' : '恢复在招'}
                        </button>
                      ) : (
                        <>
                          <Link
                            to={`/jobs/${job.id}/match`}
                            className="text-xs font-medium text-ink hover:text-body hover:underline"
                          >
                            匹配候选人
                          </Link>
                          <Link
                            to={`/pipeline?job=${job.id}`}
                            className="text-xs font-medium text-muted hover:text-ink hover:underline"
                          >
                            查看候选人流程
                          </Link>
                          <button
                            type="button"
                            onClick={() => onStartEditJobAttribution(job)}
                            className="text-xs font-medium text-muted hover:text-ink hover:underline"
                          >
                            编辑归属
                          </button>
                          <button
                            type="button"
                            onClick={() => onCloseJob(job.id, job.title)}
                            disabled={closingId === job.id}
                            className="text-xs font-medium text-muted hover:text-danger-600 disabled:opacity-50"
                          >
                            {closingId === job.id ? '关闭中…' : '关闭'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Reveal>
          </table>
        </div>
      )}
    </Card>
  );
}
