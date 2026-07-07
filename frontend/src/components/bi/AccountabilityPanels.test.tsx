import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DepartmentAccountabilityTable, InterviewerAccountabilityTable } from './AccountabilityPanels';

describe('AccountabilityPanels', () => {
  it('renders interviewer follow-up metrics with plain-language labels', () => {
    render(
      <InterviewerAccountabilityTable
        interviewers={[
          {
            interviewer_id: 1,
            interviewer_name: '王面试官',
            assigned_count: 6,
            feedback_submitted: 4,
            passed_count: 2,
            rejected_count: 1,
            pass_rate: 50,
            reject_rate: 25,
            pending_feedback: 2,
            overdue_feedback: 1,
          },
        ]}
      />
    );

    expect(screen.getByText('王面试官')).toBeInTheDocument();
    expect(screen.getByText('已反馈 4')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('超时 1')).toBeInTheDocument();
  });

  it('renders department collaboration metrics and round details', () => {
    render(
      <DepartmentAccountabilityTable
        departments={[
          {
            department: '技术研发部',
            jobs_count: 2,
            interviewers_count: 2,
            assigned_count: 5,
            feedback_submitted: 3,
            passed_count: 2,
            rejected_count: 1,
            pending_feedback: 1,
            overdue_feedback: 0,
            pass_rate: 40,
            reject_rate: 20,
            rounds: [
              {
                round: 'technical',
                round_label: '技术面',
                assigned_count: 3,
                feedback_submitted: 2,
                passed_count: 2,
                rejected_count: 0,
                pending_feedback: 1,
                overdue_feedback: 0,
                pass_rate: 66.7,
                reject_rate: 0,
              },
              {
                round: 'business',
                round_label: '业务面',
                assigned_count: 2,
                feedback_submitted: 1,
                passed_count: 0,
                rejected_count: 1,
                pending_feedback: 1,
                overdue_feedback: 0,
                pass_rate: 0,
                reject_rate: 50,
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByText('技术研发部')).toBeInTheDocument();
    expect(screen.getByText('2 个岗位 · 2 位面试官')).toBeInTheDocument();
    expect(screen.getByText('技术面 2/3')).toBeInTheDocument();
    expect(screen.getByText('业务面 0/2')).toBeInTheDocument();
    expect(screen.getByText('超时 0')).toBeInTheDocument();
  });
});
