// Role-aware navigation definition. Later tasks plug their pages into these routes.

import {
  LayoutDashboard,
  KanbanSquare,
  BarChart3,
  ClipboardCheck,
  Sparkles,
  Settings,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { featureNavItems } from '../app/featureRegistry';
import type { Role } from '../types';

export interface NavItem {
  to: string;
  label: string;
  labelByRole?: Partial<Record<Role, string>>;
  icon: LucideIcon;
  // Roles allowed to see this item.
  roles: Role[];
  activePaths?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: '工作台',
    icon: LayoutDashboard,
    roles: ['recruiter', 'manager', 'admin', 'interviewer'],
  },
  ...featureNavItems,
  {
    to: '/pipeline',
    label: '候选人流程',
    icon: KanbanSquare,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/interviews',
    label: '我的面试',
    icon: ClipboardCheck,
    roles: ['interviewer'],
  },
  {
    to: '/bi',
    label: '数据看板',
    icon: BarChart3,
    roles: ['manager', 'admin'],
  },
  {
    to: '/agent',
    label: 'AI 助手',
    icon: Sparkles,
    roles: ['recruiter', 'manager', 'admin'],
  },
  {
    to: '/admin/agent-logs',
    label: 'AI 调用日志',
    icon: ScrollText,
    roles: ['admin'],
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

export function navLabelForRole(item: NavItem, role: Role | null): string {
  if (!role) return item.label;
  return item.labelByRole?.[role] ?? item.label;
}

// Default landing route after login. All roles land on the dashboard (/).
export function defaultRouteForRole(): string {
  return '/';
}
