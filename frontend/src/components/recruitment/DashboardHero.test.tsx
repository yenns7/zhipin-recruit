import { ClipboardCheck } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DashboardHero } from './DashboardHero';
import type { DashboardRoleInfo } from './dashboardTypes';

const info: DashboardRoleInfo = {
  label: '面试官',
  duty: '处理分配给我的面试安排与反馈',
  icon: ClipboardCheck,
  accent: 'bg-teal-50 text-teal-700',
  gradient: 'linear-gradient(135deg, #5AC8FA, #34C759)',
  action: { to: '/interviews', label: '查看我的面试' },
};

describe('DashboardHero', () => {
  it('renders role identity and primary action for the current user', () => {
    render(<DashboardHero name="测试面试官" info={info} />);

    expect(
      screen.getByRole('heading', { name: '欢迎回来，测试面试官' }),
    ).toBeInTheDocument();
    expect(screen.getByText('面试官')).toBeInTheDocument();
    expect(screen.getByText('处理分配给我的面试安排与反馈')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看我的面试/ })).toHaveAttribute(
      'href',
      '/interviews',
    );
  });
});
