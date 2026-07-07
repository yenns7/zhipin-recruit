import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { StaffDrilldownHeader } from './StaffDrilldownHeader';

describe('StaffDrilldownHeader', () => {
  it('renders the staff title, period copy, comparison badge, and back action', () => {
    const onBack = vi.fn();

    render(
      <StaffDrilldownHeader
        name="李招聘"
        days={30}
        conversionRate={18.5}
        teamAvgConv={12.3}
        onBack={onBack}
      />,
    );

    expect(screen.getAllByText('← 返回团队总览').length).toBeGreaterThan(0);
    expect(screen.getByText('李招聘')).toBeInTheDocument();
    expect(screen.getByText(/专员漏斗详情/)).toBeInTheDocument();
    expect(screen.getByText(/高于/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '← 返回团队总览' })[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
