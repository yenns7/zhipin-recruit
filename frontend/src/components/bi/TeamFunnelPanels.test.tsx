import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { TeamFunnelPanels } from './TeamFunnelPanels';

describe('TeamFunnelPanels', () => {
  it('renders the team funnel and flow overview cards', () => {
    render(
      <TeamFunnelPanels
        funnel={{
          pending: 12,
          ai_screen: 8,
          interview: 5,
          offer: 2,
          onboarded: 1,
          rejected: 4,
          conversion_rate: 8.3,
          archived_total: 6,
          pipeline_total: 27,
        }}
      />,
    );

    expect(screen.getByText('团队当前阶段分布')).toBeInTheDocument();
    expect(screen.getByText('流程状态总览')).toBeInTheDocument();
    expect(screen.getAllByText('全流程入职占比').length).toBeGreaterThan(0);
    expect(screen.getAllByText('待筛选').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI初筛').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已入职').length).toBeGreaterThan(0);
  });
});
