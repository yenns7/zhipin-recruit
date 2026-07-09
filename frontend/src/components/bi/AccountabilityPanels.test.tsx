import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/utils';
import { DepartmentAccountabilityTable, InterviewerAccountabilityTable } from './AccountabilityPanels';

describe('AccountabilityPanels', () => {
  it('renders interviewer follow-up metrics with plain-language labels', () => {
    render(
      <InterviewerAccountabilityTable
        interviewers={[
          {
            interviewerId: 1,
            interviewerName: '王面试官',
            assignedCount: 6,
            feedbackSubmitted: 4,
            passedCount: 2,
            rejectedCount: 1,
            passRate: 50,
            rejectRate: 25,
            pendingFeedback: 2,
            overdueFeedback: 1,
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
            jobsCount: 2,
            interviewersCount: 2,
            assignedCount: 5,
            feedbackSubmitted: 3,
            passedCount: 2,
            rejectedCount: 1,
            pendingFeedback: 1,
            overdueFeedback: 0,
            passRate: 40,
            rejectRate: 20,
            rounds: [
              {
                round: 'technical',
                roundLabel: '技术面',
                assignedCount: 3,
                feedbackSubmitted: 2,
                passedCount: 2,
                rejectedCount: 0,
                pendingFeedback: 1,
                overdueFeedback: 0,
                passRate: 66.7,
                rejectRate: 0,
              },
              {
                round: 'business',
                roundLabel: '业务面',
                assignedCount: 2,
                feedbackSubmitted: 1,
                passedCount: 0,
                rejectedCount: 1,
                pendingFeedback: 1,
                overdueFeedback: 0,
                passRate: 0,
                rejectRate: 50,
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
