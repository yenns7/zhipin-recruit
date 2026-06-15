import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '../types';
import { candidatesFeature } from '../features/candidates';

export interface FeatureNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

export interface FeatureRoute {
  path: string;
  element: ReactElement;
  roles?: Role[];
}

export interface AppFeature {
  id: string;
  navItems: FeatureNavItem[];
  routes: FeatureRoute[];
  topLevelPaths?: string[];
}

export const featureRegistry: AppFeature[] = [
  candidatesFeature,
];

export const featureNavItems = featureRegistry.flatMap((feature) => feature.navItems);
export const featureRoutes = featureRegistry.flatMap((feature) => feature.routes);
export const featureTopLevelPaths = featureRegistry.flatMap(
  (feature) => feature.topLevelPaths ?? [],
);
