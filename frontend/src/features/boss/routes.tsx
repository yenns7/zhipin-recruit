import { lazy } from 'react';
import type { FeatureRoute } from '../../app/featureRegistry';
import { BOSS_ROLES } from './permissions';

const BossPage = lazy(() => import('./pages/BossPage').then((module) => ({ default: module.BossPageWithBoundary })));
const BossCliTestPage = lazy(() => import('./pages/BossCliTestPage').then((module) => ({ default: module.BossCliTestPage })));

export const bossRoutes: FeatureRoute[] = [
  {
    path: '/boss',
    element: <BossPage />,
    roles: BOSS_ROLES,
  },
  {
    path: '/boss/cli',
    element: <BossCliTestPage />,
    roles: BOSS_ROLES,
  },
];
