import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Reveal } from '../motion';
import { Card } from '../ui';
import type { DashboardWorkflowAction } from './dashboardTypes';

const ACTION_GRADIENTS = [
  'linear-gradient(135deg, #007AFF, #5856D6)',
  'linear-gradient(135deg, #AF52DE, #FF2D55)',
  'linear-gradient(135deg, #FF9500, #FF2D55)',
  'linear-gradient(135deg, #34C759, #5AC8FA)',
  'linear-gradient(135deg, #5856D6, #AF52DE)',
  'linear-gradient(135deg, #007AFF, #34C759)',
];

function FeatureCard({
  to,
  label,
  desc,
  icon: Icon,
  gradient,
}: DashboardWorkflowAction & { gradient: string }) {
  return (
    <Link
      to={to}
      className="group block rounded-apple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <Card variant="elevated" className="h-full">
        <div className="flex items-start gap-4 px-5 py-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition-transform duration-300 group-hover:scale-110"
            style={{ background: gradient }}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink">{label}</span>
              <ArrowRight className="h-4 w-4 text-muted-soft transition-all duration-300 group-hover:translate-x-1 group-hover:text-ink" />
            </div>
            <p className="mt-1 text-sm text-muted">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function DashboardQuickActions({ actions }: { actions: DashboardWorkflowAction[] }) {
  return (
    <section>
      <h2 className="mb-4 font-display text-lg text-ink">常用动作</h2>
      <Reveal
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.06}
        y={16}
      >
        {actions.map((item, i) => (
          <FeatureCard
            key={item.to}
            {...item}
            gradient={ACTION_GRADIENTS[i % ACTION_GRADIENTS.length]}
          />
        ))}
      </Reveal>
    </section>
  );
}
