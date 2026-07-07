import { ArrowRight, CheckCircle2, Clock3, Inbox, KanbanSquare, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from './dashboardStats';
import { AnimatedNumber, Reveal } from '../motion';
import { Card } from '../ui';

function valueOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function TodoCard({
  to,
  label,
  value,
  desc,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  value: number | null;
  desc: string;
  icon: LucideIcon;
  tone: 'neutral' | 'warning' | 'success';
}) {
  const toneClass = {
    neutral: 'bg-surface-soft text-muted',
    warning: 'bg-warning-50 text-warning-700',
    success: 'bg-success-50 text-success-700',
  }[tone];

  return (
    <Link
      to={to}
      className="group block rounded-apple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-3 px-5 py-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{label}</span>
              <span className="font-display text-xl tabular-nums text-ink">
                {value === null ? '—' : <AnimatedNumber value={value} />}
              </span>
            </span>
            <span className="mt-1 block text-sm text-muted">{desc}</span>
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-soft transition-transform duration-200 group-hover:translate-x-1" />
        </div>
      </Card>
    </Link>
  );
}

export function RecruiterTodoPanel({ stats }: { stats: DashboardStats }) {
  const feedbackPending = valueOrNull(stats.performance?.feedback_pending);
  const businessReview = valueOrNull(stats.performance?.business_review_entries ?? stats.businessReview);
  const interview = valueOrNull(stats.performance?.interview_entries ?? stats.interview);
  const offer = valueOrNull(stats.performance?.offer_entries ?? stats.offer);

  return (
    <section>
      <h2 className="mb-4 font-display text-lg text-ink">今日待办</h2>
      <Reveal
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        stagger={0.05}
        y={14}
      >
        <TodoCard
          to="/pipeline?stage=business_review"
          label="业务待反馈"
          value={businessReview}
          desc="推动用人部门确认"
          icon={Inbox}
          tone={businessReview && businessReview > 0 ? 'warning' : 'success'}
        />
        <TodoCard
          to="/pipeline?stage=interview"
          label="面试中跟进"
          value={interview}
          desc="关注候选人当前进展"
          icon={KanbanSquare}
          tone={interview && interview > 0 ? 'neutral' : 'success'}
        />
        <TodoCard
          to="/interviews?focus=pending"
          label="待补反馈"
          value={feedbackPending}
          desc="催补面试结论"
          icon={Clock3}
          tone={feedbackPending && feedbackPending > 0 ? 'warning' : 'success'}
        />
        <TodoCard
          to="/pipeline?stage=offer"
          label="Offer跟进"
          value={offer}
          desc="跟进发放与入职"
          icon={CheckCircle2}
          tone={offer && offer > 0 ? 'neutral' : 'success'}
        />
      </Reveal>
    </section>
  );
}
