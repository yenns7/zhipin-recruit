import type { Role } from '../../types';

export const CANDIDATE_LIST_ROLES: Role[] = [
  'recruiter',
  'manager',
  'admin',
];

export const CANDIDATE_DETAIL_ROLES: Role[] = [
  ...CANDIDATE_LIST_ROLES,
  'interviewer',
];
