// 招聘流程阶段的共享配置：标签、配色、顺序，供看板与卡片复用。
import type { PipelineStage } from '../types';

export interface StageConfig {
  key: PipelineStage;
  label: string;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  dot: string;
}

// 主流程顺序（rejected 为终态，单独置于末尾）。
export const STAGES: StageConfig[] = [
  {
    key: 'pending',
    label: '待筛选',
    bg: 'bg-surface-soft',
    border: 'border-hairline',
    text: 'text-body',
    badgeBg: 'bg-surface-strong text-body',
    dot: 'bg-muted',
  },
  {
    key: 'ai_screen',
    label: 'AI 初筛',
    bg: 'bg-brand-50',
    border: 'border-hairline',
    text: 'text-brand-700',
    badgeBg: 'bg-brand-100 text-brand-700',
    dot: 'bg-brand-500',
  },
  {
    key: 'interview_first',
    label: '一面',
    bg: 'bg-warning-50',
    border: 'border-warning-200',
    text: 'text-warning-700',
    badgeBg: 'bg-warning-100 text-warning-700',
    dot: 'bg-warning-500',
  },
  {
    key: 'interview_second',
    label: '二面',
    bg: 'bg-warning-50',
    border: 'border-warning-200',
    text: 'text-warning-700',
    badgeBg: 'bg-warning-100 text-warning-700',
    dot: 'bg-warning-500',
  },
  {
    key: 'interview_final',
    label: '终面',
    bg: 'bg-warning-50',
    border: 'border-warning-300',
    text: 'text-warning-800',
    badgeBg: 'bg-warning-200 text-warning-800',
    dot: 'bg-warning-600',
  },
  {
    key: 'offer',
    label: 'Offer',
    bg: 'bg-success-50',
    border: 'border-success-200',
    text: 'text-success-700',
    badgeBg: 'bg-success-100 text-success-700',
    dot: 'bg-success-500',
  },
  {
    key: 'onboarded',
    label: '已入职',
    bg: 'bg-success-50',
    border: 'border-success-300',
    text: 'text-success-800',
    badgeBg: 'bg-success-200 text-success-800',
    dot: 'bg-success-600',
  },
  {
    key: 'rejected',
    label: '淘汰',
    bg: 'bg-danger-50',
    border: 'border-danger-200',
    text: 'text-danger-700',
    badgeBg: 'bg-danger-100 text-danger-700',
    dot: 'bg-danger-500',
  },
];

export const STAGE_BY_KEY: Record<PipelineStage, StageConfig> = STAGES.reduce(
  (acc, s) => {
    acc[s.key] = s;
    return acc;
  },
  {} as Record<PipelineStage, StageConfig>,
);

export function stageLabel(key: PipelineStage): string {
  return STAGE_BY_KEY[key]?.label ?? key;
}
