import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DemandHealthPanel } from './DemandHealthPanel';

describe('DemandHealthPanel', () => {
  it('renders demand health metrics and priority summary', () => {
    render(
      <DemandHealthPanel
        demands={{
          activeTotal: 12,
          overdue: 3,
          hrNoRecommendation: 2,
          businessFeedbackPending: 4,
          priorityCounts: { A: 1, B: 5, C: 6 },
        }}
      />,
    );

    expect(screen.getByText('需求健康')).toBeInTheDocument();
    expect(screen.getByText('A/B/C 1 / 5 / 6')).toBeInTheDocument();
    expect(screen.getByText('活跃需求')).toBeInTheDocument();
    expect(screen.getByText('逾期需求')).toBeInTheDocument();
    expect(screen.getByText('HR 无推荐')).toBeInTheDocument();
    expect(screen.getByText('业务待反馈')).toBeInTheDocument();
  });
});
