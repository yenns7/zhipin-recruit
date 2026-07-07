import { Briefcase, Upload } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DashboardQuickActions } from './DashboardQuickActions';
import type { DashboardWorkflowAction } from './dashboardTypes';

const actions: DashboardWorkflowAction[] = [
  {
    to: '/upload',
    label: '上传简历',
    desc: '把新候选人放进简历库，解析失败也能重试',
    icon: Upload,
  },
  {
    to: '/jobs',
    label: '选择岗位匹配',
    desc: '先选岗位，再运行候选人匹配并加入流程',
    icon: Briefcase,
  },
];

describe('DashboardQuickActions', () => {
  it('renders quick action cards and preserves navigation targets', () => {
    render(<DashboardQuickActions actions={actions} />);

    expect(screen.getByText('常用动作')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /上传简历/ })).toHaveAttribute('href', '/upload');
    expect(screen.getByRole('link', { name: /选择岗位匹配/ })).toHaveAttribute('href', '/jobs');
    expect(screen.getByText('先选岗位，再运行候选人匹配并加入流程')).toBeInTheDocument();
  });
});
