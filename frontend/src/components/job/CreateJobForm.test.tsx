import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { CreateJobForm } from './CreateJobForm';
import { api } from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      clarifyJob: vi.fn(),
      createJob: vi.fn(),
    },
  };
});

describe('CreateJobForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the compact create-job form with preset city and department helpers', () => {
    const { container } = render(<CreateJobForm onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '新建岗位' })).toBeInTheDocument();
    expect(screen.getByLabelText('岗位名称')).toBeInTheDocument();
    expect(screen.getByLabelText('城市')).toHaveAttribute('list', 'job-city-options');
    expect(screen.getByLabelText('部门')).toHaveAttribute('list', 'job-department-options');
    expect(screen.getByLabelText('岗位编号')).toBeInTheDocument();
    expect(screen.getByLabelText('岗位描述（JD）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步：AI 澄清' })).toBeDisabled();
    expect(
      container.querySelector('datalist#job-city-options option[value="深圳"]')
    ).toBeInTheDocument();
    expect(
      container.querySelector('datalist#job-department-options option[value="技术研发部"]')
    ).toBeInTheDocument();
  });

  it('uses the shared alert-style error state when AI clarify fails', async () => {
    vi.mocked(api.clarifyJob).mockRejectedValueOnce(new Error('AI 澄清失败，可直接保存'));

    render(<CreateJobForm onCreated={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('岗位名称'), {
      target: { value: '前端工程师' },
    });
    fireEvent.change(screen.getByLabelText('岗位描述（JD）'), {
      target: { value: '负责招聘系统前端开发，维护岗位列表和人岗匹配功能。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步：AI 澄清' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('AI 澄清失败，可直接保存');
  });
});
