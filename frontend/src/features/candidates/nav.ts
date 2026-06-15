import { Users } from 'lucide-react';
import type { FeatureNavItem } from '../../app/featureRegistry';
import { CANDIDATE_ROLES } from './permissions';

export const candidatesNavItems: FeatureNavItem[] = [
  {
    to: '/candidates',
    label: '简历库',
    icon: Users,
    roles: CANDIDATE_ROLES,
  },
];
