// BI 看板专用可视化组件 — Apple 风格 SVG 漏斗 + 光环转化率仪表。
// 渐变填充、GSAP 描绘/计数动画、光环拖尾效果。
// 全部尊重 prefers-reduced-motion。

import { useRef } from 'react';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../../lib/motion';

// ── 漏斗梯形图（Apple 风格 — 渐变填充）──────────────────────

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface FunnelDiagramProps {
  stages: FunnelStage[];
  rejected?: number;
  rejectedColor?: string;
}

export function FunnelDiagram({
  stages,
  rejected = 0,
  rejectedColor = '#ef4444',
}: FunnelDiagramProps) {
  const scope = useRef<HTMLDivElement>(null);

  const max = Math.max(...stages.map((s) => s.value), 1);
  const W = 100;
  const rowH = 48;
  const gap = 10;
  const H = stages.length * rowH + (stages.length - 1) * gap;

  const halfW = (v: number) => (Math.max(v, 0) / max) * (W / 2) * 0.92;

  const allZero = stages.every((s) => s.value === 0) && rejected === 0;
  const stageTotal = Math.max(stages.reduce((sum, stage) => sum + Math.max(stage.value, 0), 0), 1);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const { reduce } = ctx.conditions as { reduce: boolean };
          const bands = root.querySelectorAll<SVGPolygonElement>('[data-band]');
          const labels = root.querySelectorAll<HTMLElement>('[data-flabel]');
          const convs = root.querySelectorAll<HTMLElement>('[data-conv]');
          if (reduce) {
            gsap.set([...bands, ...labels, ...convs], { autoAlpha: 1 });
            return;
          }
          const tl = gsap.timeline();
          tl.from(bands, {
            scaleX: 0,
            transformOrigin: 'center center',
            autoAlpha: 0,
            duration: DUR.slow,
            ease: EASE.apple,
            stagger: STAGGER.loose,
          })
            .from(
              labels,
              { autoAlpha: 0, x: -12, duration: DUR.base, stagger: STAGGER.loose, ease: EASE.apple },
              '<0.1',
            )
            .from(
              convs,
              { autoAlpha: 0, y: -8, duration: DUR.base, stagger: STAGGER.loose, ease: EASE.apple },
              '<0.05',
            );
        },
      );
    },
    { scope },
  );

  if (allZero) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted">
        暂无数据
      </div>
    );
  }

  // Generate gradient IDs for each stage
  const gradientIds = stages.map((_s, i) => `funnel-grad-${i}`);

  return (
    <div ref={scope}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H * 2.4}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {stages.map((_s, i) => {
              // Create a lighter variant for gradient top
              const hex = _s.color;
              const lighter = hex === '#111111' ? '#3a3a3a' :
                hex === '#374151' ? '#4b5563' :
                hex === '#6b7280' ? '#9ca3af' :
                hex === '#898989' ? '#a8a8a8' : hex;
              return (
                <linearGradient key={gradientIds[i]} id={gradientIds[i]} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lighter} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={hex} stopOpacity="0.88" />
                </linearGradient>
              );
            })}
          </defs>
          {stages.map((s, i) => {
            const next = stages[i + 1];
            const yTop = i * (rowH + gap);
            const topHalf = halfW(s.value);
            const botHalf = halfW(next ? next.value : s.value);
            const cx = W / 2;
            const pts = [
              [cx - topHalf, yTop],
              [cx + topHalf, yTop],
              [cx + botHalf, yTop + rowH],
              [cx - botHalf, yTop + rowH],
            ]
              .map((p) => p.join(','))
              .join(' ');
            return (
              <polygon
                key={s.label}
                data-band
                points={pts}
                fill={`url(#${gradientIds[i]})`}
                rx="2"
              />
            );
          })}
        </svg>

        {/* Stage labels + values */}
        <div className="pointer-events-none absolute inset-0">
          {stages.map((s, i) => {
            const topPct = ((i * (rowH + gap) + rowH / 2) / H) * 100;
            return (
              <div
                key={s.label}
                data-flabel
                className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-baseline gap-1.5 whitespace-nowrap"
                style={{ top: `${topPct}%` }}
              >
                <span className="text-xs font-medium text-white/95 drop-shadow-sm">
                  {s.label}
                </span>
                <span className="font-display text-sm text-white tabular-nums drop-shadow-sm">
                  {s.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current-stage share labels */}
        <div className="pointer-events-none absolute inset-0">
          {stages.map((s, i) => {
            const rate = (Math.max(s.value, 0) / stageTotal) * 100;
            const topPct = ((i * (rowH + gap) + rowH / 2) / H) * 100;
            return (
              <div
                key={s.label}
                data-conv
                className="absolute right-1 -translate-y-1/2"
                style={{ top: `${topPct}%` }}
              >
                <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-body shadow-apple-sm">
                  阶段占比 {rate.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {rejected > 0 && (
        <p className="mt-2 text-right text-xs text-muted-soft">
          <span
            className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
            style={{ background: rejectedColor }}
          />
          淘汰：{rejected} 人
        </p>
      )}
    </div>
  );
}

// ── 光环转化率仪表（Apple 风格 — 渐变光环 + 拖尾）───────────

interface ConversionRingProps {
  percent: number;
  label?: string;
  size?: number;
  color?: string;
}

export function ConversionRing({
  percent,
  label = '整体转化率',
  size = 180,
  color = '#007AFF',
}: ConversionRingProps) {
  const scope = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const arc = root.querySelector<SVGCircleElement>('[data-arc]');
      const glow = root.querySelector<SVGCircleElement>('[data-glow]');
      const num = numRef.current;
      if (!arc || !num) return;
      num.textContent = clamped.toFixed(1) + '%';

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const { reduce } = ctx.conditions as { reduce: boolean };
          const target = c - (clamped / 100) * c;
          if (reduce) {
            gsap.set(arc, { strokeDashoffset: target });
            if (glow) gsap.set(glow, { strokeDashoffset: target });
            num.textContent = clamped.toFixed(1) + '%';
            return;
          }
          const tl = gsap.timeline();
          tl.fromTo(
            arc,
            { strokeDashoffset: c },
            { strokeDashoffset: target, duration: DUR.slow * 1.2, ease: EASE.apple },
          );
          if (glow) {
            tl.fromTo(
              glow,
              { strokeDashoffset: c },
              { strokeDashoffset: target, duration: DUR.slow * 1.2, ease: EASE.apple },
              '<',
            );
          }
        },
      );
    },
    { dependencies: [clamped], scope },
  );

  return (
    <div ref={scope} className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="50%" stopColor={color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
            opacity={0.4}
          />
          {/* Glow halo */}
          <circle
            data-glow
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke + 4}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c}
            opacity={0.15}
            style={{ filter: 'blur(4px)' }}
          />
          {/* Main arc */}
          <circle
            data-arc
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-grad)`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            ref={numRef}
            className="font-display text-3xl text-ink tabular-nums"
          >
            {clamped.toFixed(1) + '%'}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
    </div>
  );
}
