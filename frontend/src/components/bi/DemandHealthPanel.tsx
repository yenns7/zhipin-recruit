import { AnimatedNumber } from '../motion';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '../ui';
import type { BiDemandMetrics } from '../../types';
import { MetricTile } from './MetricTile';

interface DemandHealthPanelProps {
  demands: BiDemandMetrics;
}

export function DemandHealthPanel({ demands }: DemandHealthPanelProps) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>需求健康</CardTitle>
          <Badge tone="neutral">
            A/B/C {demands.priority_counts.A} / {demands.priority_counts.B} / {demands.priority_counts.C}
          </Badge>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile
            label="活跃需求"
            value={<AnimatedNumber value={demands.active_total} />}
            sub="待处理与招聘中"
          />
          <MetricTile
            label="逾期需求"
            value={<AnimatedNumber value={demands.overdue} />}
            sub="超过目标日期"
            tone={demands.overdue > 0 ? 'danger' : 'success'}
          />
          <MetricTile
            label="HR 无推荐"
            value={<AnimatedNumber value={demands.hr_no_recommendation} />}
            sub="接手 7 天未推荐"
            tone={demands.hr_no_recommendation > 0 ? 'warning' : 'success'}
          />
          <MetricTile
            label="业务待反馈"
            value={<AnimatedNumber value={demands.business_feedback_pending} />}
            sub="卡在业务复核"
            tone={demands.business_feedback_pending > 0 ? 'warning' : 'success'}
          />
        </div>
      </CardBody>
    </Card>
  );
}
