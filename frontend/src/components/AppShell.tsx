// Authenticated layout: left sidebar nav + top bar with user identity and logout.
// 侧边栏导航项 stagger 进场、active 滑动高亮、底部角色身份卡；GSAP 克制精致动效。

import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navItemsForRole } from '../lib/nav';
import { cn } from '../lib/cn';
import { Badge } from './ui';
import { AccountSettings } from './AccountSettings';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../lib/motion';
import type { Role } from '../types';

const ROLE_LABELS: Record<Role, string> = {
  recruiter: '招聘专员',
  manager: '经理',
  admin: '管理员',
  interviewer: '面试官',
};

// 每个角色一句话职责，展示在侧边栏底部身份卡，强化角色辨识。
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

export function AppShell() {
  const { name, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const items = role ? navItemsForRole(role) : [];

  const sidebarScope = useRef<HTMLElement>(null);
  const mainScope = useRef<HTMLDivElement>(null);

  // 账户设置弹窗（修改密码）
  const [showAccount, setShowAccount] = useState(false);

  // 顶级页（侧边栏直达的页面）不显示返回按钮；详情/子页才显示。
  const TOP_LEVEL_PATHS = new Set([
    '/', '/agent', '/candidates', '/upload', '/jobs', '/pipeline', '/interviews', '/bi',
  ]);
  const isTopLevel = TOP_LEVEL_PATHS.has(location.pathname);

  // 侧边栏首次挂载：Logo 弹入 → 导航项 stagger 上浮 → 身份卡淡入。
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
            gsap.from('[data-shell]', { autoAlpha: 0, duration: DUR.fast });
            return;
          }
          const tl = gsap.timeline();
          tl.from('[data-shell="logo"]', {
            autoAlpha: 0,
            scale: 0.6,
            duration: DUR.base,
            ease: EASE.back,
          })
            .from(
              '[data-shell="nav-item"]',
              {
                autoAlpha: 0,
                x: -14,
                duration: DUR.base,
                stagger: STAGGER.base,
                ease: EASE.out,
              },
              '-=0.2'
            )
            .from(
              '[data-shell="identity"]',
              { autoAlpha: 0, y: 12, duration: DUR.base },
              '-=0.25'
            );
        }
      );
    },
    { scope: sidebarScope }
  );

  // 路由切换：主内容区淡入上浮（替换原 CSS fadeIn，节奏更统一）。
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
        ease: EASE.out,
      });
    },
    { dependencies: [location.pathname], scope: mainScope }
  );

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen bg-surface-soft">
      {/* Sidebar */}
      <aside
        ref={sidebarScope}
        className="flex w-60 flex-col border-r border-hairline bg-canvas"
      >
        <div className="flex h-16 items-center gap-2 border-b border-hairline-soft px-5">
          <div
            data-shell="logo"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white shadow-card"
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
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-surface-card text-ink font-semibold'
                    : 'text-muted hover:bg-surface-soft hover:text-ink hover:translate-x-0.5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* active 左侧滑动指示条 */}
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-ink transition-all duration-300',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <item.icon
                    className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110"
                    strokeWidth={2}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 底部角色身份卡 */}
        {role && (
          <div
            data-shell="identity"
            className="m-3 rounded-lg border border-hairline-soft bg-surface-soft p-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-on-primary">
                {initials(name ?? '')}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium text-ink">
                  {name}
                </div>
                <div className="mt-0.5">
                  <Badge tone="brand">{ROLE_LABELS[role]}</Badge>
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
        <header className="flex h-16 items-center justify-between border-b border-hairline bg-canvas px-6">
          {/* 左侧：自然返回（基于浏览器历史；顶级页隐藏） */}
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
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-card text-xs font-semibold text-body">
                {initials(name ?? '')}
              </div>
              <div className="leading-tight">
                <div className="text-sm font-medium text-ink">{name}</div>
              </div>
              {role && <Badge tone="brand">{ROLE_LABELS[role]}</Badge>}
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
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
