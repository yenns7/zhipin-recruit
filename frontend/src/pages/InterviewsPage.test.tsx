import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../test/utils';
import { InterviewsPage } from './InterviewsPage';
import { api } from '../lib/api';
import type { CandidateListItem, JobListItem } from '../types';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      listCandidates: vi.fn(),
      listJobs: vi.fn(),
      startInterview: vi.fn(),
      submitInterview: vi.fn(),
    },
  };
});

const candidates: CandidateListItem[] = [
  {
    id: 101,
    nameMasked: '张候选',
    ownerHrId: 7,
    createdAt: '2026-07-06T00:00:00Z',
    tagCount: 0,
  },
];

const jobs: JobListItem[] = [
  {
    id: 11,
    title: '后端工程师',
    city: '上海',
    department: '研发',
    jobCode: 'JOB-11',
    status: 'active',
    createdAt: '2026-07-06T00:00:00Z',
    jdText: '',
    ownerHrId: 1,
  },
];

describe('InterviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCandidates).mockResolvedValue(candidates);
    vi.mocked(api.listJobs).mockResolvedValue(jobs);
    vi.mocked(api.startInterview).mockResolvedValue({
      sessionId: 1,
      questions: ['请介绍一次你主导的项目。'],
    });
  });

  it('uses the shared alert-style error state when setup data fails to load', async () => {
    vi.mocked(api.listCandidates)
      .mockRejectedValueOnce(new Error('候选人加载失败'))
      .mockResolvedValueOnce(candidates);

    render(<InterviewsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('候选人加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(api.listCandidates).toHaveBeenCalledTimes(2));
  });

  it('uses the shared alert-style error state when report submission fails', async () => {
    vi.mocked(api.submitInterview).mockRejectedValueOnce(new Error('提交评估失败'));

    render(<InterviewsPage />);

    fireEvent.change(await screen.findByLabelText('候选人'), { target: { value: '101' } });
    fireEvent.change(screen.getByLabelText('面试岗位'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: '生成参考题目' }));

    expect(await screen.findByText('录入候选人作答')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('第 1 题 · 候选人作答录入'), {
      target: { value: '我负责过核心服务拆分。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交 AI 参考评估' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交评估失败');
  });

  it('uses the shared alert-style error state when report generation returns no report', async () => {
    vi.mocked(api.submitInterview).mockResolvedValueOnce({
      interview_id: 88,
      report: null,
    } as never);

    render(<InterviewsPage />);

    fireEvent.change(await screen.findByLabelText('候选人'), { target: { value: '101' } });
    fireEvent.change(screen.getByLabelText('面试岗位'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: '生成参考题目' }));

    expect(await screen.findByText('录入候选人作答')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('第 1 题 · 候选人作答录入'), {
      target: { value: '我负责过核心服务拆分。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交 AI 参考评估' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('报告生成失败');
  });
});
