import type { AppFeature } from '../../app/featureRegistry';
import { demandsNavItems } from './nav';
import { demandsRoutes } from './routes';

export const demandsFeature: AppFeature = {
  id: 'demands',
  navItems: demandsNavItems,
  routes: demandsRoutes,
  topLevelPaths: ['/demands'],
};

export { demandsApi } from './api';
export type * from './types';
