import { AnimatedNumber } from '../motion';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '../ui';
import type { BiResumeMetrics } from '../../types';
import { pct, safeNum } from './biMetrics';
import { MetricTile } from './MetricTile';

interface ResumeConsumptionPanelProps {
  resumes: BiResumeMetrics;
}

export function ResumeConsumptionPanel({ resumes }: ResumeConsumptionPanelProps) {
  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>简历消化</CardTitle>
          <Badge tone="neutral">
            进流程 {pct(safeNum(resumes.pipeline_entry_rate))}
          </Badge>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile
            label="入库简历"
            value={<AnimatedNumber value={resumes.total_candidates} />}
            sub="当前周期"
          />
          <MetricTile
            label="绑定岗位"
            value={<AnimatedNumber value={resumes.linked_to_job} />}
            sub={`${resumes.unassigned} 份暂未绑定`}
          />
          <MetricTile
            label="已匹配"
            value={<AnimatedNumber value={resumes.matched_candidates} />}
            sub={`匹配率 ${pct(safeNum(resumes.match_rate))}`}
          />
          <MetricTile
            label="已进流程"
            value={<AnimatedNumber value={resumes.in_pipeline} />}
            sub={`${resumes.not_in_pipeline} 份未进流程`}
            tone={resumes.not_in_pipeline > 0 ? 'warning' : 'success'}
          />
          <MetricTile
            label="进流程率"
            value={
              <AnimatedNumber
                value={safeNum(resumes.pipeline_entry_rate)}
                decimals={1}
                suffix="%"
              />
            }
            sub="入库到流程转化"
            tone={resumes.pipeline_entry_rate > 0 ? 'success' : 'neutral'}
          />
        </div>
      </CardBody>
    </Card>
  );
}
