import { UserSearch } from 'lucide-react';
import type { FeatureNavItem } from '../../app/featureRegistry';
import { BOSS_ROLES } from './permissions';

export const bossNavItems: FeatureNavItem[] = [
  {
    to: '/boss',
    label: 'BOSS直聘',
    icon: UserSearch,
    roles: BOSS_ROLES,
  },
];
