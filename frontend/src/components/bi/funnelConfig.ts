import type { BiFunnel } from '../../types';
import { safeNum } from './biMetrics';

export const FUNNEL_STAGES: { label: string; value: (f: BiFunnel) => number }[] = [
  { label: '待筛选', value: (f) => safeNum(f.pending) },
  { label: 'AI初筛', value: (f) => safeNum(f.ai_screen) },
  { label: '面试中', value: (f) => safeNum(f.interview) },
  { label: 'Offer', value: (f) => safeNum(f.offer) },
  { label: '已入职', value: (f) => safeNum(f.onboarded) },
];

export const FUNNEL_COLORS: string[] = [
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF9500',
  '#34C759',
];

export const REJECTED_COLOR = '#FF3B30';
