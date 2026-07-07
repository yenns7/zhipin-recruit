import { Badge } from '../ui';
import type { BiDataQualityWarning } from '../../types';

export function DataQualityWarningsPanel({ warnings }: { warnings: BiDataQualityWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="rounded-md border border-warning-200 bg-warning-50 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-warning-700">数据质量提醒</p>
        <Badge tone="warning">{warnings.length} 条</Badge>
      </div>
      <div className="space-y-2">
        {warnings.slice(0, 4).map((item) => (
          <div key={`${item.metric}-${item.label}`} className="text-sm text-warning-700">
            <span className="font-medium">{item.label}</span>
            <span className="mx-1 text-warning-700">·</span>
            <span>{item.detail}</span>
            <span className="ml-2 tabular-nums text-warning-700">
              {item.numerator}/{item.denominator}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-warning-700">下一步：检查是否跳过面试直接进入 Offer。</p>
    </div>
  );
}
