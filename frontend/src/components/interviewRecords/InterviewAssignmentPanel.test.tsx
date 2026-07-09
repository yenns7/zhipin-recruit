import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { InterviewAssignmentPanel } from './InterviewAssignmentPanel';
import { api } from '../../lib/api';
import type { CandidateListItem, InterviewAssignment, InterviewerOption, JobListItem } from '../../types';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      createInterviewAssignment: vi.fn(),
    },
  };
});

const candidates: CandidateListItem[] = [
  {
    id: 11,
    nameMasked: '张候选',
    ownerHrId: 7,
    createdAt: '2026-07-06T00:00:00Z',
    tagCount: 0,
  },
];

const jobs: JobListItem[] = [
  {
    id: 21,
    title: '前端工程师',
    city: '上海',
    department: '研发',
    jobCode: 'JOB-21',
    status: 'active',
    createdAt: '2026-07-06T00:00:00Z',
    jdText: '',
    ownerHrId: 1,
  },
];

const interviewers: InterviewerOption[] = [
  {
    id: 31,
    name: '李面试官',
    role: 'interviewer',
  },
];

const assignments: InterviewAssignment[] = [];

describe('InterviewAssignmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared alert-style error state when saving an interview assignment fails', async () => {
    vi.mocked(api.createInterviewAssignment).mockRejectedValueOnce(new Error('保存失败'));

    render(
      <InterviewAssignmentPanel
        candidates={candidates}
        jobs={jobs}
        interviewers={interviewers}
        assignments={assignments}
        open
        onCreated={vi.fn()}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '11' } });
    fireEvent.change(selects[1], { target: { value: '21' } });
    fireEvent.change(selects[3], { target: { value: '31' } });
    fireEvent.change(screen.getByPlaceholderText('例：腾讯会议 123 或会议室 A'), {
      target: { value: '腾讯会议 123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存安排' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');
  });
});
