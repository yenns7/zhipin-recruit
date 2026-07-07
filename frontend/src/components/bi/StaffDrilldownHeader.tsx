import { Badge } from '../ui';
import { pct } from './biMetrics';

interface StaffDrilldownHeaderProps {
  name: string;
  days: number;
  conversionRate: number | null;
  teamAvgConv: number | null;
  onBack: () => void;
}

export function StaffDrilldownHeader({
  name,
  days,
  conversionRate,
  teamAvgConv,
  onBack,
}: StaffDrilldownHeaderProps) {
  const avg = teamAvgConv ?? 0;
  const aboveAvg = conversionRate !== null && conversionRate > avg;
  const atAvg = conversionRate !== null && conversionRate === avg;

  return (
    <>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors duration-200 hover:text-ink focus:outline-none focus-visible:underline"
      >
        ← 返回团队总览
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display text-ink">{name}</h1>
          <p className="mt-0.5 text-sm text-muted">专员漏斗详情 · 当前存量 · 绩效按近 {days} 天入库简历</p>
        </div>
        {conversionRate !== null && teamAvgConv !== null && (
          <Badge tone={aboveAvg ? 'success' : atAvg ? 'neutral' : 'danger'}>
            转化率 {pct(conversionRate)}{' '}
            {aboveAvg ? '▲ 高于' : atAvg ? '= ' : '▼ 低于'}团队均值 {pct(avg)}
          </Badge>
        )}
      </div>
    </>
  );
}
