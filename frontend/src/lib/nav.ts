// Role-aware navigation definition. Later tasks plug their pages into these routes.

import {
  LayoutDashboard,
  Bell,
  Briefcase,
  KanbanSquare,
  BarChart3,
  Bot,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { featureNavItems } from '../app/featureRegistry';
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
    to: '/notifications',
    label: '通知中心',
    icon: Bell,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  ...featureNavItems,
  { to: '/jobs', label: '岗位管理', icon: Briefcase, roles: ALL_STAFF },
  {
    to: '/pipeline',
    label: '招聘流程',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  {
    to: '/interviews',
    label: '面试中心',
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
    to: '/admin/settings',
    label: '系统设置',
    icon: Settings,
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
