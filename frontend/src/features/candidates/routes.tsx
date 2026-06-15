import type { FeatureRoute } from '../../app/featureRegistry';
import { CANDIDATE_ROLES } from './permissions';
import { CandidatesPage } from './pages/CandidatesPage';
import { CandidateProfilePage } from './pages/CandidateProfilePage';

export const candidatesRoutes: FeatureRoute[] = [
  {
    path: '/candidates',
    element: <CandidatesPage />,
    roles: CANDIDATE_ROLES,
  },
  {
    path: '/candidates/:id',
    element: <CandidateProfilePage />,
    roles: CANDIDATE_ROLES,
  },
];
