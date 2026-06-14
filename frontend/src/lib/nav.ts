// Role-aware navigation definition. Later tasks plug their pages into these routes.

import {
  LayoutDashboard,
  Users,
  Upload,
  Briefcase,
  KanbanSquare,
  BarChart3,
  Bot,
  Sparkles,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Roles allowed to see this item.
  roles: Role[];
}

const ALL_STAFF: Role[] = ['recruiter', 'manager', 'admin'];

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: '工作台',
    icon: LayoutDashboard,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  {
    to: '/agent',
    label: 'AI 助手',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  {
    to: '/candidates',
    label: '候选人',
    icon: Users,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  { to: '/upload', label: '简历上传', icon: Upload, roles: ALL_STAFF },
  { to: '/jobs', label: '岗位管理', icon: Briefcase, roles: ALL_STAFF },
  {
    to: '/pipeline',
    label: '招聘流程',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  {
    to: '/interviews',
    label: '面试记录',
    icon: Bot,
    roles: ['recruiter', 'interviewer', 'manager', 'admin'],
  },
  {
    to: '/bi',
    label: '数据看板',
    icon: BarChart3,
    roles: ['manager', 'admin'],
  },
  {
    to: '/admin/users',
    label: '用户管理',
    icon: ShieldCheck,
    roles: ['admin'],
  },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// Default landing route after login. All roles land on the dashboard (/).
export function defaultRouteForRole(): string {
  return '/';
}
