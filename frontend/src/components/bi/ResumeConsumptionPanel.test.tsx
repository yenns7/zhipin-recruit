import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { ResumeConsumptionPanel } from './ResumeConsumptionPanel';

describe('ResumeConsumptionPanel', () => {
  it('renders resume consumption metrics and pipeline entry summary', () => {
    render(
      <ResumeConsumptionPanel
        resumes={{
          totalCandidates: 120,
          linkedToJob: 90,
          unassigned: 30,
          matchedCandidates: 80,
          matchRate: 66.7,
          inPipeline: 50,
          notInPipeline: 70,
          pipelineEntryRate: 41.7,
        }}
      />,
    );

    expect(screen.getByText('简历消化')).toBeInTheDocument();
    expect(screen.getByText('进流程 41.7%')).toBeInTheDocument();
    expect(screen.getByText('入库简历')).toBeInTheDocument();
    expect(screen.getByText('绑定岗位')).toBeInTheDocument();
    expect(screen.getByText('已匹配')).toBeInTheDocument();
    expect(screen.getByText('已进流程')).toBeInTheDocument();
    expect(screen.getByText('进流程率')).toBeInTheDocument();
  });
});
