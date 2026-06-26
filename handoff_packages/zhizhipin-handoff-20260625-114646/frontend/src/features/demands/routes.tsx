import { lazy } from 'react';
import type { FeatureRoute } from '../../app/featureRegistry';
import { DEMAND_ROLES } from './permissions';

const DemandsPage = lazy(() => import('./pages/DemandsPage').then((module) => ({ default: module.DemandsPage })));

export const demandsRoutes: FeatureRoute[] = [
  {
    path: '/demands',
    element: <DemandsPage />,
    roles: DEMAND_ROLES,
  },
];
