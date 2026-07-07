import { AnimatedNumber, Reveal } from '../motion';
import type { BiStaffMember } from '../../types';
import { KpiCard } from './KpiCard';
import { pct, safeNum } from './biMetrics';

interface StaffKpiGridProps {
  staffMember: BiStaffMember;
}

export function StaffKpiGrid({ staffMember }: StaffKpiGridProps) {
  return (
    <Reveal as="div" className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.07}>
      <KpiCard
        label="简历量"
        value={<AnimatedNumber value={safeNum(staffMember.resumes)} />}
        sub={`解析失败 ${safeNum(staffMember.parse_failed)}`}
        accent="#007AFF"
      />
      <KpiCard
        label="有效推荐"
        value={<AnimatedNumber value={safeNum(staffMember.effective_recommendations)} />}
        sub="进入候选人流程"
        accent="#FF9500"
      />
      <KpiCard
        label="推荐成功面试"
        value={
          <span className="inline-flex items-baseline gap-1">
            <AnimatedNumber value={safeNum(staffMember.interview_entries)} />
          </span>
        }
        sub="进入面试中阶段"
        accent="#007AFF"
      />
      <KpiCard
        label="面试通过"
        value={
          <span className="inline-flex items-baseline gap-1">
            <AnimatedNumber value={safeNum(staffMember.interview_passed)} />
            <span className="text-base text-muted">
              / {safeNum(staffMember.interview_entries)}
            </span>
          </span>
        }
        sub={`通过率 ${pct(safeNum(staffMember.interview_pass_rate))}`}
        accent="#5856D6"
      />
      <KpiCard
        label="Offer"
        value={<AnimatedNumber value={safeNum(staffMember.offer_entries)} />}
        sub="已推进到 Offer"
        accent="#AF52DE"
      />
      <KpiCard
        label="入职数"
        value={<AnimatedNumber value={safeNum(staffMember.onboarded)} />}
        sub="候选人已入职"
        accent="#34C759"
      />
      <KpiCard
        label="推荐入职率"
        value={
          <AnimatedNumber
            value={safeNum(staffMember.recommendation_to_onboard_rate)}
            decimals={1}
            suffix="%"
          />
        }
        accent="#34C759"
      />
      <KpiCard
        label="反馈待补"
        value={<AnimatedNumber value={safeNum(staffMember.feedback_pending)} />}
        sub={`${safeNum(staffMember.feedback_overdue)} 条已超时`}
        accent="#FF3B30"
      />
    </Reveal>
  );
}
