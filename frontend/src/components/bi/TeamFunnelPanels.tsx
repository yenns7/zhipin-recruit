import { AnimatedNumber, Reveal } from '../motion';
import { Card, CardBody, CardHeader, CardTitle } from '../ui';
import { FunnelDiagram, ConversionRing } from './BiVisuals';
import { FUNNEL_COLORS, FUNNEL_STAGES, REJECTED_COLOR } from './funnelConfig';
import { safeNum } from './biMetrics';
import type { BiFunnel } from '../../types';

interface TeamFunnelPanelsProps {
  funnel: BiFunnel;
}

export function TeamFunnelPanels({ funnel }: TeamFunnelPanelsProps) {
  return (
    <Reveal as="div" className="grid grid-cols-1 gap-6 lg:grid-cols-2" stagger={0.1} y={20}>
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>团队当前阶段分布</CardTitle>
        </CardHeader>
        <CardBody>
          <FunnelDiagram
            stages={FUNNEL_STAGES.map(({ label, value }, i) => ({
              label,
              value: value(funnel),
              color: FUNNEL_COLORS[i] ?? '#007AFF',
            }))}
            rejected={safeNum(funnel.rejected)}
            rejectedColor={REJECTED_COLOR}
          />
        </CardBody>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>流程状态总览</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="mb-5 flex justify-center">
            <ConversionRing
              percent={safeNum(funnel.conversion_rate)}
              label="全流程入职占比"
              color="#007AFF"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {FUNNEL_STAGES.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl bg-surface-soft px-3 py-2.5 transition-colors hover:bg-surface-card"
              >
                <p className="mb-0.5 text-xs text-muted">{label}</p>
                <p className="text-lg font-display text-ink">
                  <AnimatedNumber value={value(funnel)} />
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </Reveal>
  );
}
