// 登录 / 注册页。居中卡片，在登录与注册两种模式间切换。
// 强化企业 HR 平台定位，仅限内部员工使用，不面向应聘者。

import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { defaultRouteForRole } from '../lib/nav';
import { Button, Card, Input, ErrorState, Select } from '../components/ui';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../lib/motion';
import type { Role } from '../types';

type Mode = 'login' | 'register';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'recruiter', label: '招聘专员' },
  { value: 'manager', label: '经理' },
  { value: 'admin', label: '管理员' },
  { value: 'interviewer', label: '面试官' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const scope = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('recruiter');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 进场动画：Logo 弹入 → 品牌文案 → 卡片 → 页脚，依次上浮。
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
            gsap.from('[data-anim]', { autoAlpha: 0, duration: DUR.fast });
            return;
          }
          const tl = gsap.timeline();
          tl.from('[data-anim="logo"]', {
            autoAlpha: 0,
            scale: 0.5,
            duration: DUR.slow,
            ease: EASE.back,
          })
            .from(
              '[data-anim="brand"]',
              { autoAlpha: 0, y: 12, duration: DUR.base, stagger: STAGGER.base },
              '-=0.35'
            )
            .from(
              '[data-anim="card"]',
              { autoAlpha: 0, y: 20, duration: DUR.base },
              '-=0.25'
            )
            .from(
              '[data-anim="footer"]',
              { autoAlpha: 0, y: 8, duration: DUR.fast },
              '-=0.3'
            );
        }
      );
    },
    { scope }
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        await api.register({ name, email, password, role });
      }
      const res = await api.login({ email, password });
      login(res);
      navigate(defaultRouteForRole(), { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : '操作失败，请稍后重试。';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div
      ref={scope}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-soft px-4"
    >
      {/* 精致背景：柔和径向高光 + 细网格，避免纯色偏素 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(17,17,17,0.05) 0%, rgba(17,17,17,0) 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(17,17,17,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.025) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          maskImage: 'radial-gradient(80% 60% at 50% 40%, #000 0%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(80% 60% at 50% 40%, #000 0%, transparent 100%)',
        }}
      />
      <div className="relative w-full max-w-sm">
        {/* Logo + 品牌区 */}
        <div className="mb-8 flex flex-col items-center">
          <div
            data-anim="logo"
            className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-lg font-bold text-on-primary shadow-card-lg"
          >
            智
          </div>
          <h1 data-anim="brand" className="font-display text-xl text-ink">
            智聘 · 招聘管理系统
          </h1>
          <p data-anim="brand" className="mt-1 text-sm text-muted">
            企业招聘管理平台 · 仅限内部员工使用
          </p>
        </div>

        <Card data-anim="card" className="p-6">
          {/* 页内标题 */}
          <h2 className="mb-5 text-base font-display text-ink">
            {mode === 'login' ? '登录工作台' : '创建账户'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Input
                label="姓名"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入真实姓名"
                required
                autoComplete="name"
              />
            )}
            <Input
              label="邮箱"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@company.com"
              required
              autoComplete="email"
            />
            <Input
              label="密码"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <Select
                label="角色"
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            )}

            {error && <ErrorState message={error} />}

            <Button type="submit" className="w-full" loading={loading}>
              {mode === 'login' ? '登录' : '创建账户'}
            </Button>
          </form>
        </Card>

        <p data-anim="footer" className="mt-6 text-center text-sm text-muted">
          {mode === 'login' ? (
            <>
              还没有账户？{' '}
              <button
                onClick={() => switchMode('register')}
                className="font-medium text-ink hover:underline"
              >
                去注册
              </button>
            </>
          ) : (
            <>
              已有账户？{' '}
              <button
                onClick={() => switchMode('login')}
                className="font-medium text-ink hover:underline"
              >
                去登录
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
