import type { PipelineBoardCandidate, PipelineStage } from '../types';
import { stageLabel } from './pipelineStages';

export const NEXT_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  pending: 'ai_screen',
  ai_screen: 'business_review',
  business_review: 'interview',
  interview: 'offer',
  offer: 'onboarded',
};

export function isInterviewStage(stage: PipelineStage): boolean {
  return stage === 'interview';
}

export function isTerminalStage(stage: PipelineStage): boolean {
  return stage === 'onboarded' || stage === 'rejected';
}

export function stageAgeDays(updatedAt?: string | null): number | null {
  if (!updatedAt) return null;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return null;
  const diff = Date.now() - ts;
  if (diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function stageAgeClass(stage: PipelineStage, days: number | null): string {
  if (days === null) return 'text-muted-soft';
  if (stage === 'business_review' && days >= 3) return 'text-warning-700';
  if ((stage === 'pending' || stage === 'ai_screen') && days >= 5) return 'text-warning-700';
  if (isInterviewStage(stage) && days >= 2) return 'text-warning-700';
  return 'text-muted-soft';
}

export function stageAgeLabel(updatedAt?: string | null): string {
  const days = stageAgeDays(updatedAt);
  if (days === null) return '暂无停留时间';
  return `停留 ${days} 天`;
}

export interface PipelineInsight {
  title: string;
  detail: string;
  tone: 'neutral' | 'warning' | 'success';
}

export function buildPipelineInsight(candidate: PipelineBoardCandidate | null): PipelineInsight {
  if (!candidate) {
    return {
      title: '请选择候选人',
      detail: '从左侧列表选择候选人后，这里会给出下一步建议。',
      tone: 'neutral',
    };
  }

  const days = stageAgeDays(candidate.updated_at);
  if (isTerminalStage(candidate.stage)) {
    return {
      title: '已到终态',
      detail: `${stageLabel(candidate.stage)}候选人无需继续推进，可用于复盘和统计。`,
      tone: 'success',
    };
  }

  if (typeof days === 'number' && days >= 7) {
    return {
      title: '优先跟进',
      detail: `停留超过 ${days} 天，建议先确认阻塞原因，并补充跟进备注。`,
      tone: 'warning',
    };
  }

  if (candidate.stage === 'business_review') {
    return {
      title: '催业务反馈',
      detail: '当前卡在业务待反馈，建议提醒用人经理确认是否进入面试。',
      tone: 'warning',
    };
  }

  if (isInterviewStage(candidate.stage)) {
    return {
      title: '处理面试动作',
      detail: '优先确认是否已安排面试、是否待补反馈，必要时进入面试任务页处理。',
      tone: 'warning',
    };
  }

  if (candidate.stage === 'offer') {
    return {
      title: '补齐 Offer 信息',
      detail: '建议记录薪资区间、审批状态和预计入职日期，方便后续统计入职转化。',
      tone: 'warning',
    };
  }

  return {
    title: '按节奏推进',
    detail: `当前处于${stageLabel(candidate.stage)}，可根据匹配度和业务反馈推进到下一阶段。`,
    tone: 'neutral',
  };
}
