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
            进流程 {pct(safeNum(resumes.pipelineEntryRate))}
          </Badge>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile
            label="入库简历"
            value={<AnimatedNumber value={resumes.totalCandidates} />}
            sub="当前周期"
          />
          <MetricTile
            label="绑定岗位"
            value={<AnimatedNumber value={resumes.linkedToJob} />}
            sub={`${resumes.unassigned} 份暂未绑定`}
          />
          <MetricTile
            label="已匹配"
            value={<AnimatedNumber value={resumes.matchedCandidates} />}
            sub={`匹配率 ${pct(safeNum(resumes.matchRate))}`}
          />
          <MetricTile
            label="已进流程"
            value={<AnimatedNumber value={resumes.inPipeline} />}
            sub={`${resumes.notInPipeline} 份未进流程`}
            tone={resumes.notInPipeline > 0 ? 'warning' : 'success'}
          />
          <MetricTile
            label="进流程率"
            value={
              <AnimatedNumber
                value={safeNum(resumes.pipelineEntryRate)}
                decimals={1}
                suffix="%"
              />
            }
            sub="入库到流程转化"
            tone={resumes.pipelineEntryRate > 0 ? 'success' : 'neutral'}
          />
        </div>
      </CardBody>
    </Card>
  );
}
