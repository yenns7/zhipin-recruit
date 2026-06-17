// Authenticated layout: Apple-style sidebar nav + top bar with user identity and logout.
// 毛玻璃侧边栏、渐变 Logo、GSAP 克制动效。

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ArrowLeft, KeyRound, Bell } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navItemsForRole } from '../lib/nav';
import { cn } from '../lib/cn';
import { Badge } from './ui';
import { AccountSettings } from './AccountSettings';
import { AgentChatProvider } from '../lib/agentChat';
import { featureTopLevelPaths } from '../app/featureRegistry';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../lib/motion';
import type { Role } from '../types';
import type { NavItem } from '../lib/nav';

const ROLE_LABELS: Record<Role, string> = {
  recruiter: '招聘专员',
  manager: '经理',
  admin: '管理员',
  interviewer: '面试官',
};

const ROLE_DUTY: Record<Role, string> = {
  recruiter: '简历 · 岗位 · 匹配 · AI 面试',
  manager: '团队漏斗 · 专员效能',
  admin: '系统管理 · 全局监控',
  interviewer: '候选人 · 流程 · 面试评估',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function restoreSidebarNavItems(sidebar: HTMLElement | null) {
  if (!sidebar) return;
  const navItems = sidebar.querySelectorAll<HTMLElement>('[data-shell="nav-item"]');
  if (navItems.length === 0) return;
  gsap.killTweensOf(navItems);
  gsap.set(navItems, {
    clearProps: 'opacity,visibility,transform',
  });
}

function isPathActive(pathname: string, path: string) {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isNavItemActive(item: NavItem, pathname: string, defaultActive: boolean) {
  return defaultActive || (item.activePaths ?? []).some((path) => isPathActive(pathname, path));
}

export function AppShell() {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = role ? navItemsForRole(role) : [];

  const sidebarScope = useRef<HTMLElement>(null);
  const mainScope = useRef<HTMLDivElement>(null);
  const lastPathRef = useRef<string | null>(null);

  const [showAccount, setShowAccount] = useState(false);

  const TOP_LEVEL_PATHS = new Set([
    '/',
    '/agent',
    ...featureTopLevelPaths,
    '/notifications',
    '/pipeline',
    '/interviews',
    '/bi',
    '/admin/settings',
  ]);
  const isTopLevel = TOP_LEVEL_PATHS.has(location.pathname);

  useEffect(() => {
    const sidebar = sidebarScope.current;
    if (!sidebar) return;

    if (lastPathRef.current === null) {
      lastPathRef.current = location.pathname;
      return;
    }
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;

    restoreSidebarNavItems(sidebar);
  }, [location.pathname]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const { reduce } = ctx.conditions as { reduce: boolean };
          if (reduce) {
            gsap.from('[data-shell="logo"], [data-shell="identity"]', {
              opacity: 0,
              duration: DUR.fast,
              clearProps: 'opacity',
            });
            return;
          }
          const tl = gsap.timeline();
          tl.from('[data-shell="logo"]', {
            autoAlpha: 0,
            scale: 0.6,
            duration: DUR.base,
            ease: EASE.apple,
          })
            .from(
              '[data-shell="nav-item"]',
              {
                x: -14,
                duration: DUR.base,
                stagger: STAGGER.base,
                ease: EASE.apple,
                clearProps: 'transform',
                onComplete: () => restoreSidebarNavItems(sidebarScope.current),
              },
              '-=0.2',
            )
            .from(
              '[data-shell="identity"]',
              { autoAlpha: 0, y: 12, duration: DUR.base, ease: EASE.apple },
              '-=0.25',
            );
        },
      );
    },
    { scope: sidebarScope },
  );

  useGSAP(
    () => {
      if (typeof window !== 'undefined' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      gsap.from(mainScope.current, {
        autoAlpha: 0,
        y: 10,
        duration: DUR.base,
        ease: EASE.apple,
      });
    },
    { dependencies: [location.pathname], scope: mainScope },
  );

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-surface-soft">
      {/* Sidebar — glass effect */}
      <aside
        ref={sidebarScope}
        className="flex w-60 flex-col border-r border-glass-border"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
      >
        <div className="flex h-16 items-center gap-2 px-5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div
            data-shell="logo"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-apple-sm"
            style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
          >
            智
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">
            智聘
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-shell="nav-item"
              className={({ isActive }) => {
                const active = isNavItemActive(item, location.pathname, isActive);
                return cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-surface-card text-ink font-semibold shadow-apple-xs'
                    : 'text-muted hover:bg-surface-soft hover:text-ink hover:translate-x-0.5',
                );
              }}
            >
              {({ isActive }) => {
                const active = isNavItemActive(item, location.pathname, isActive);
                return (
                  <>
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-all duration-300',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                      style={{ background: 'linear-gradient(180deg, #007AFF, #5856D6)' }}
                    />
                    <item.icon
                      className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110"
                      strokeWidth={2}
                    />
                    {item.label}
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>

        {/* Identity card */}
        {role && (
          <div
            data-shell="identity"
            className="glass-subtle m-3"
            style={{ padding: '12px' }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
              >
                {initials(name ?? '')}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium text-ink">
                  {name}
                </div>
                <div className="mt-0.5">
                  <Badge tone="glass">{ROLE_LABELS[role]}</Badge>
                </div>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-muted-soft">
              {ROLE_DUTY[role]}
            </p>
          </div>
        )}
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header
          className="flex h-16 items-center justify-between bg-canvas px-6"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center">
            {!isTopLevel && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="返回上一页"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <NavLink
              to="/notifications"
              title="通知中心"
              aria-label="通知中心"
              className={({ isActive }) =>
                cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isActive && 'bg-surface-card text-ink shadow-apple-xs',
                )
              }
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
            </NavLink>
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)' }}
              >
                {initials(name ?? '')}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium text-ink">{name}</div>
              </div>
              {role && <Badge tone="glass">{ROLE_LABELS[role]}</Badge>}
            </div>
            <button
              onClick={() => setShowAccount(true)}
              className="ml-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <KeyRound className="h-4 w-4" />
              修改密码
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </header>

        {showAccount && <AccountSettings onClose={() => setShowAccount(false)} />}

        <main className="flex-1 overflow-y-auto p-6">
          <div ref={mainScope} className="mx-auto max-w-7xl">
            <AgentChatProvider>
              <Outlet />
            </AgentChatProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
