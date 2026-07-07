import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { StaffFunnelPanel } from './StaffFunnelPanel';

describe('StaffFunnelPanel', () => {
  it('renders the staff funnel, conversion ring, and rejected summary', () => {
    render(
      <StaffFunnelPanel
        funnel={{
          pending: 6,
          ai_screen: 4,
          interview: 3,
          offer: 1,
          onboarded: 1,
          rejected: 2,
          conversion_rate: 16.7,
          archived_total: 3,
          pipeline_total: 14,
        }}
      />,
    );

    expect(screen.getByText('个人招聘漏斗')).toBeInTheDocument();
    expect(screen.getAllByText('个人入职占比').length).toBeGreaterThan(0);
    expect(screen.getAllByText('待筛选').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offer').length).toBeGreaterThan(0);
    expect(screen.getByText('淘汰')).toBeInTheDocument();
  });
});
