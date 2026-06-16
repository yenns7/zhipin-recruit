import type { FeatureRoute } from '../../app/featureRegistry';
import { DEMAND_ROLES } from './permissions';
import { DemandsPage } from './pages/DemandsPage';

export const demandsRoutes: FeatureRoute[] = [
  {
    path: '/demands',
    element: <DemandsPage />,
    roles: DEMAND_ROLES,
  },
];
