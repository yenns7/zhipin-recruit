import type { LucideIcon } from 'lucide-react';
import type { Role } from '../../types';

export interface DashboardRoleInfo {
  label: string;
  duty: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  action: { to: string; label: string };
}

export interface WorkflowActionConfig {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  roles: Role[];
}

export interface DashboardWorkflowAction {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}
