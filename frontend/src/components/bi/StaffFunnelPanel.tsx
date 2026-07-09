import { AnimatedNumber } from '../motion';
import { Card, CardBody, CardHeader, CardTitle } from '../ui';
import { FunnelDiagram, ConversionRing } from './BiVisuals';
import { FUNNEL_COLORS, FUNNEL_STAGES, REJECTED_COLOR } from './funnelConfig';
import { safeNum } from './biMetrics';
import type { BiFunnel } from '../../types';

interface StaffFunnelPanelProps {
  funnel: BiFunnel;
}

export function StaffFunnelPanel({ funnel }: StaffFunnelPanelProps) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>个人招聘漏斗</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <FunnelDiagram
            stages={FUNNEL_STAGES.map(({ label, value }, i) => ({
              label,
              value: value(funnel),
              color: FUNNEL_COLORS[i] ?? '#007AFF',
            }))}
            rejected={safeNum(funnel.rejected)}
            rejectedColor={REJECTED_COLOR}
          />
          <div className="flex justify-center lg:px-4">
            <ConversionRing
              percent={safeNum(funnel.conversionRate)}
              label="个人入职占比"
              color="#007AFF"
              size={160}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FUNNEL_STAGES.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl bg-surface-soft px-3 py-2.5 transition-colors hover:bg-surface-card"
            >
              <p className="mb-0.5 text-xs text-muted">{label}</p>
              <p className="text-xl font-display text-ink">
                <AnimatedNumber value={value(funnel)} />
              </p>
            </div>
          ))}
          <div className="rounded-xl bg-danger-50 px-3 py-2.5">
            <p className="mb-0.5 text-xs text-danger-600">淘汰</p>
            <p className="text-xl font-display text-danger-700">
              <AnimatedNumber value={safeNum(funnel.rejected)} />
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
