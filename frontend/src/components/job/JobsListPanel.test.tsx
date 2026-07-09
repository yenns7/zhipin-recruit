import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { JobsListPanel } from './JobsListPanel';
import type { JobListItem } from '../../types';

const sampleJobs: JobListItem[] = [
  {
    id: 7,
    title: '前端工程师',
    city: '深圳',
    department: '技术研发部',
    createdAt: '2026-07-01T08:00:00Z',
    status: 'active',
    jobCode: 'SZ-FE-007',
    jdText: '',
    ownerHrId: 1,
  },
];

describe('JobsListPanel', () => {
  it('renders filters and job actions for the active jobs view', () => {
    render(
      <JobsListPanel
        loading={false}
        error={null}
        reload={vi.fn()}
        jobs={sampleJobs}
        filteredJobs={sampleJobs}
        hasActiveFilters={false}
        cityFilter=""
        departmentFilter=""
        cityOptions={['深圳', '上海']}
        departmentOptions={['技术研发部', '产品部']}
        jobStatus="active"
        editingJobId={null}
        editDraft={{ city: '', department: '', jobCode: '' }}
        savingJobId={null}
        closingId={null}
        restoringId={null}
        onCityFilterChange={vi.fn()}
        onDepartmentFilterChange={vi.fn()}
        onJobStatusChange={vi.fn()}
        onEditDraftChange={vi.fn()}
        onStartEditJobAttribution={vi.fn()}
        onCancelEditJobAttribution={vi.fn()}
        onSaveJobAttribution={vi.fn()}
        onCloseJob={vi.fn()}
        onRestoreJob={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: '岗位列表' })).toBeInTheDocument();
    expect(screen.getByLabelText('按城市筛选岗位')).toBeInTheDocument();
    expect(screen.getByLabelText('按部门筛选岗位')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '在招岗位' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '匹配候选人' })).toHaveAttribute(
      'href',
      '/jobs/7/match'
    );
    expect(screen.getByRole('button', { name: '编辑归属' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });
});
