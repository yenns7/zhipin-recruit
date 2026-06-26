import type { AppFeature } from '../../app/featureRegistry';
import { bossNavItems } from './nav';
import { bossRoutes } from './routes';

export const bossFeature: AppFeature = {
  id: 'boss',
  navItems: bossNavItems,
  routes: bossRoutes,
  topLevelPaths: ['/boss'],
};
