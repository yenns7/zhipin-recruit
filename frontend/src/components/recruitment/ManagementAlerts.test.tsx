import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { ManagementAlerts } from './ManagementAlerts';

describe('ManagementAlerts', () => {
  it('renders empty-state guidance when there are no alerts', () => {
    render(<ManagementAlerts alerts={[]} />);

    expect(screen.getByText('管理提醒')).toBeInTheDocument();
    expect(screen.getByText('暂无明显卡点')).toBeInTheDocument();
    expect(
      screen.getByText('当前没有候选人长时间卡住，也没有逾期未填的面试反馈。'),
    ).toBeInTheDocument();
  });

  it('renders alert cards with priority badges and deep links', () => {
    render(
      <ManagementAlerts
        alerts={[
          {
            kind: 'stale_pipeline',
            priority: 'high',
            title: '候选人流程卡住',
            detail: '候选人已在当前阶段停留 5 天',
            candidate_id: 1,
            candidate_name: '候选人A',
            job_id: 2,
            job_title: '前端工程师',
            stage: 'interview',
            stage_label: '面试中',
            age_days: 5,
            action_path: '/pipeline?candidate=1',
          },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /候选人流程卡住/ })).toHaveAttribute(
      'href',
      '/pipeline?candidate=1',
    );
    expect(screen.getByText('流程卡住')).toBeInTheDocument();
    expect(screen.getByText('1 项待处理')).toBeInTheDocument();
  });
});
