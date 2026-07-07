import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { ResumeConsumptionPanel } from './ResumeConsumptionPanel';

describe('ResumeConsumptionPanel', () => {
  it('renders resume consumption metrics and pipeline entry summary', () => {
    render(
      <ResumeConsumptionPanel
        resumes={{
          total_candidates: 120,
          linked_to_job: 90,
          unassigned: 30,
          matched_candidates: 80,
          match_rate: 66.7,
          in_pipeline: 50,
          not_in_pipeline: 70,
          pipeline_entry_rate: 41.7,
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
