import {
  BarChart3,
  Briefcase,
  ClipboardCheck,
  KanbanSquare,
  LineChart,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCog,
} from 'lucide-react';
import type { Role } from '../../types';
import type {
  DashboardRoleInfo,
  DashboardWorkflowAction,
  WorkflowActionConfig,
} from './dashboardTypes';

export const dashboardRoleInfo: Record<Role, DashboardRoleInfo> = {
  recruiter: {
    label: '招聘专员',
    duty: '管理候选人简历、创建岗位，运行智能匹配与预筛参考',
    icon: UserCog,
    accent: 'bg-blue-50 text-accent-blue',
    gradient: 'linear-gradient(135deg, #007AFF, #5856D6)',
    action: { to: '/upload', label: '上传简历' },
  },
  manager: {
    label: '经理',
    duty: '洞察团队招聘漏斗与专员效能，把控招聘全局',
    icon: LineChart,
    accent: 'bg-purple-50 text-accent-purple',
    gradient: 'linear-gradient(135deg, #AF52DE, #5856D6)',
    action: { to: '/bi', label: '查看数据看板' },
  },
  admin: {
    label: '管理员',
    duty: '系统全量管理与团队效能监控，统筹整体运转',
    icon: ShieldCheck,
    accent: 'bg-brand-50 text-ink',
    gradient: 'linear-gradient(135deg, #111111, #374151)',
    action: { to: '/bi', label: '查看数据看板' },
  },
  interviewer: {
    label: '面试官',
    duty: '处理分配给我的面试安排与反馈',
    icon: ClipboardCheck,
    accent: 'bg-teal-50 text-teal-700',
    gradient: 'linear-gradient(135deg, #5AC8FA, #34C759)',
    action: { to: '/interviews', label: '查看我的面试' },
  },
};

export const WORKFLOW_ACTIONS: WorkflowActionConfig[] = [
  {
    to: '/upload',
    label: '上传简历',
    desc: '把新候选人放进简历库，解析失败也能重试',
    icon: Upload,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/jobs',
    label: '选择岗位匹配',
    desc: '先选岗位，再运行候选人匹配并加入流程',
    icon: Briefcase,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/pipeline',
    label: '跟进候选人流程',
    desc: '推进初筛、面试、Offer、淘汰沉淀',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/interviews',
    label: '我的面试',
    desc: '查看安排并填写反馈',
    icon: ClipboardCheck,
    roles: ['interviewer'],
  },
  {
    to: '/bi',
    label: '查看团队看板',
    desc: '看漏斗、转化率和专员效能',
    icon: BarChart3,
    roles: ['manager', 'admin'],
  },
  {
    to: '/agent',
    label: '问 AI 助手',
    desc: '用自然语言查询候选人、岗位和流程',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/admin/settings',
    label: '系统设置',
    desc: '管理账号、审计日志和 AI 助手边界',
    icon: Settings,
    roles: ['admin'],
  },
];

const ACTION_ORDER_BY_ROLE: Record<Role, string[]> = {
  recruiter: ['/upload', '/jobs', '/pipeline'],
  manager: ['/bi', '/pipeline', '/agent'],
  admin: ['/bi', '/admin/settings', '/agent'],
  interviewer: ['/interviews'],
};

export function workflowActionsForRole(role: Role): DashboardWorkflowAction[] {
  const allowed = WORKFLOW_ACTIONS.filter((item) => item.roles.includes(role));
  return ACTION_ORDER_BY_ROLE[role]
    .map((to) => allowed.find((item) => item.to === to))
    .filter((item): item is WorkflowActionConfig => Boolean(item))
    .map(({ roles: _roles, ...item }) => item);
}
