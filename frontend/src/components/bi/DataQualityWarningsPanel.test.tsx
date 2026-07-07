import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DataQualityWarningsPanel } from './DataQualityWarningsPanel';

describe('DataQualityWarningsPanel', () => {
  it('renders the warning title, count, detail, and next-step guidance', () => {
    render(
      <DataQualityWarningsPanel
        warnings={[
          {
            kind: 'warning',
            metric: 'offer_without_interview',
            label: 'Offer 直接通过',
            detail: '存在跳过面试的流程记录',
            numerator: 2,
            denominator: 10,
          },
        ]}
      />
    );

    expect(screen.getByText('数据质量提醒')).toBeInTheDocument();
    expect(screen.getByText('1 条')).toBeInTheDocument();
    expect(screen.getByText('Offer 直接通过')).toBeInTheDocument();
    expect(screen.getByText('存在跳过面试的流程记录')).toBeInTheDocument();
    expect(screen.getByText('下一步：检查是否跳过面试直接进入 Offer。')).toBeInTheDocument();
  });
});
