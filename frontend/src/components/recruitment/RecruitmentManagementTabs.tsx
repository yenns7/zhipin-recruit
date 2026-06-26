import { Link, useLocation } from 'react-router-dom';
import { Briefcase, ClipboardList, Map } from 'lucide-react';
import { cn } from '../../lib/cn';

const TABS = [
  { to: '/demands', label: '用人需求', icon: ClipboardList },
  { to: '/jobs', label: '岗位画像', icon: Briefcase },
  { to: '/talent-map', label: '人才地图', icon: Map },
] as const;

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function RecruitmentManagementTabs() {
  const { pathname } = useLocation();

  return (
    <div
      aria-label="招聘管理"
      className="flex flex-wrap gap-2 border-b border-hairline pb-3"
    >
      {TABS.map((tab) => {
        const active = isActivePath(pathname, tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-surface-card text-ink shadow-apple-xs'
                : 'text-muted hover:bg-surface-soft hover:text-ink',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
