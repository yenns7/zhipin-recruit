// Authenticated layout: 主数据系统式企业后台壳子 + compact account menu.
// 保留现有路由权限，只统一展示层结构与视觉。

import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ArrowLeft, KeyRound, Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navItemsForRole, navLabelForRole } from '../lib/nav';
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
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const lastPathRef = useRef<string | null>(null);

  const [showAccount, setShowAccount] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);

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
  const activeNavItem = items.find((item) =>
    isNavItemActive(item, location.pathname, isPathActive(location.pathname, item.to)),
  );
  const activeTabLabel = activeNavItem ? navLabelForRole(activeNavItem, role) : '工作台';

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

  useEffect(() => {
    setShowAccountMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!showAccountMenu) return;

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [showAccountMenu]);

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
            gsap.from('[data-shell="logo"]', {
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
    setShowAccountMenu(false);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="enterprise-shell">
      <aside ref={sidebarScope} className="enterprise-sidebar">
        <div className="enterprise-brand">
          <div data-shell="logo" className="enterprise-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="enterprise-brand-name">
            智聘
          </span>
        </div>
        <nav className="enterprise-nav" aria-label="主导航">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-shell="nav-item"
              className={({ isActive }) => {
                const active = isNavItemActive(item, location.pathname, isActive);
                return cn(
                  'enterprise-nav-item',
                  active && 'enterprise-nav-item-active',
                );
              }}
            >
              {() => {
                const label = navLabelForRole(item, role);
                return (
                  <>
                    <item.icon
                      className="enterprise-nav-icon h-[18px] w-[18px]"
                      strokeWidth={2}
                    />
                    <span className="enterprise-nav-label">{label}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>
        <div className="enterprise-sidebar-footer">
          主数据系统式招聘工作台<br />
          当前角色：{role ? ROLE_LABELS[role] : '未识别'}
        </div>
      </aside>

      <div className="enterprise-main-column">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar-context">
            {!isTopLevel && (
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="返回上一页"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            )}
            {isTopLevel && <span>招聘业务展示环境 · UI 统一版</span>}
          </div>

          <div className="enterprise-topbar-actions">
            <span className="enterprise-topbar-chip">
              <span className="enterprise-flag-cn" aria-hidden="true" />
              中国
            </span>
            <span className="enterprise-topbar-chip">中文 ▾</span>
            <NavLink
              to="/notifications"
              title="通知中心"
              aria-label="通知中心"
              className={({ isActive }) =>
                cn(
                  'enterprise-topbar-chip enterprise-topbar-chip-hide-mobile rounded px-1.5 py-1 transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isActive && 'text-ink',
                )
              }
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              消息
            </NavLink>

            <div ref={accountMenuRef} data-shell="account-menu" className="relative">
              <button
                type="button"
                onClick={() => setShowAccountMenu((open) => !open)}
                className="enterprise-topbar-chip rounded px-1.5 py-1 transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                aria-label="账户菜单"
              >
                <span className="enterprise-avatar" aria-hidden="true">
                  {initials(name ?? '')}
                </span>
                <span className="hidden max-w-36 min-w-0 items-center gap-2 sm:flex">
                  <span className="truncate text-ink">{name}</span>
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-muted-soft transition-transform', showAccountMenu && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>

              {showAccountMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-hairline bg-canvas p-2 shadow-card-lg"
                >
                  <div className="border-b border-glass-border px-2 pb-2 pt-1">
                    <div className="truncate text-sm font-medium text-ink">{name}</div>
                    {role && (
                      <div className="mt-1">
                        <Badge tone="success">{ROLE_LABELS[role]}</Badge>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShowAccountMenu(false);
                      setShowAccount(true);
                    }}
                    className="mt-2 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                    修改密码
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="enterprise-tabs">
          <div className="enterprise-tab">Home</div>
          <div className="enterprise-tab enterprise-tab-active">{activeTabLabel}</div>
        </div>

        {showAccount && <AccountSettings onClose={() => setShowAccount(false)} />}

        <main className="enterprise-content">
          <div ref={mainScope} className="w-full">
            <AgentChatProvider>
              <Outlet />
            </AgentChatProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
