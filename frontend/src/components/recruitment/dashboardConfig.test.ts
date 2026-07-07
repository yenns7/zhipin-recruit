import { describe, expect, it } from 'vitest';
import { dashboardRoleInfo, workflowActionsForRole } from './dashboardConfig';

describe('dashboardConfig', () => {
  it('keeps interviewer dashboard focused on My Interviews only', () => {
    expect(dashboardRoleInfo.interviewer.action).toEqual({
      to: '/interviews',
      label: '查看我的面试',
    });

    expect(workflowActionsForRole('interviewer')).toEqual([
      expect.objectContaining({
        to: '/interviews',
        label: '我的面试',
      }),
    ]);
  });

  it('keeps manager workflow ordered around BI, pipeline and AI assistant', () => {
    expect(dashboardRoleInfo.manager.action).toEqual({
      to: '/bi',
      label: '查看数据看板',
    });

    expect(workflowActionsForRole('manager').map((item) => item.to)).toEqual([
      '/bi',
      '/pipeline',
      '/agent',
    ]);
  });
});
