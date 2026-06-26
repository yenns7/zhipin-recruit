import { lazy } from 'react';
import type { FeatureRoute } from '../../app/featureRegistry';
import { CANDIDATE_DETAIL_ROLES, CANDIDATE_LIST_ROLES } from './permissions';

const CandidatesPage = lazy(() => import('./pages/CandidatesPage').then((module) => ({ default: module.CandidatesPage })));
const CandidateProfilePage = lazy(() => import('./pages/CandidateProfilePage').then((module) => ({ default: module.CandidateProfilePage })));

export const candidatesRoutes: FeatureRoute[] = [
  {
    path: '/candidates',
    element: <CandidatesPage />,
    roles: CANDIDATE_LIST_ROLES,
  },
  {
    path: '/candidates/:id',
    element: <CandidateProfilePage />,
    roles: CANDIDATE_DETAIL_ROLES,
  },
];
