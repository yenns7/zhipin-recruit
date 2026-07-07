import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('shows assistant guidance and lets the user pick an example prompt', () => {
    const onPick = vi.fn();

    render(
      <EmptyState
        tools={[]}
        examples={['看看团队招聘漏斗报表', '哪些岗位卡在业务反馈？']}
        onPick={onPick}
        disabled={false}
      />,
    );

    expect(screen.getByText('你好，我是招聘智能助手')).toBeInTheDocument();
    expect(
      screen.getByText('我可以查询系统数据、整理参考建议；需要改数据时，会先等你人工确认。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '看看团队招聘漏斗报表' }));
    expect(onPick).toHaveBeenCalledWith('看看团队招聘漏斗报表');
  });

  it('renders tool chips with localized labels', () => {
    render(
      <EmptyState
        tools={[
          { name: 'list_jobs', description: '列出岗位', params: {} },
          { name: 'count_summary', description: '系统总览', params: {} },
        ]}
        examples={[]}
        onPick={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText('我能调用的工具')).toBeInTheDocument();
    expect(screen.getByText('岗位列表')).toBeInTheDocument();
    expect(screen.getByText('系统概览')).toBeInTheDocument();
  });
});
