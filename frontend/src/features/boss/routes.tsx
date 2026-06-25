import { lazy } from 'react';
import type { FeatureRoute } from '../../app/featureRegistry';
import { BOSS_ROLES } from './permissions';

const BossPage = lazy(() => import('./pages/BossPage').then((module) => ({ default: module.BossPage })));

export const bossRoutes: FeatureRoute[] = [
  {
    path: '/boss',
    element: <BossPage />,
    roles: BOSS_ROLES,
  },
];
