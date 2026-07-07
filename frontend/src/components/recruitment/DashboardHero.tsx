import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../ui';
import { Reveal } from '../motion';
import type { DashboardRoleInfo } from './dashboardTypes';

interface DashboardHeroProps {
  name: string;
  info: DashboardRoleInfo;
}

export function DashboardHero({ name, info }: DashboardHeroProps) {
  const RoleIcon = info.icon;

  return (
    <Reveal as="section" y={12} stagger={0.1}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-apple-md"
            style={{ background: info.gradient }}
          >
            <RoleIcon className="h-6 w-6" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-display text-3xl leading-tight text-ink">
              欢迎回来，{name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="glass">{info.label}</Badge>
              <p className="text-sm text-muted">{info.duty}</p>
            </div>
          </div>
        </div>
        <Link
          to={info.action.to}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 shadow-apple-sm"
          style={{ background: info.gradient }}
        >
          {info.action.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Reveal>
  );
}
