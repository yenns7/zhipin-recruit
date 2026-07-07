import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders placeholder when value is null', () => {
    render(<KpiCard label="候选人总数" value={null} />);

    expect(screen.getByText('候选人总数')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders formatted animated number with suffix and sub copy', () => {
    render(<KpiCard label="转化率" value={12.3} decimals={1} suffix="%" sub="近 30 天" />);

    expect(screen.getByText('12.3%')).toBeInTheDocument();
    expect(screen.getByText('近 30 天')).toBeInTheDocument();
  });
});
