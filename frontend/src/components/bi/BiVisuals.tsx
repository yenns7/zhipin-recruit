// BI 看板专用可视化组件 — 自定义 SVG 漏斗 + 环形转化率仪表。
// 用 GSAP 做描绘/计数动画，比基础条形图更有冲击力（炫技核心）。
// 全部尊重 prefers-reduced-motion。

import { useRef } from 'react';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../../lib/motion';

// ── 漏斗梯形图 ──────────────────────────────────────────────
// 每个阶段画成一条横向梯形带，宽度随人数收窄，阶段间标注转化率。

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

interface FunnelDiagramProps {
  stages: FunnelStage[];
  /** 淘汰人数（单独展示在底部）。 */
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
  const W = 100; // viewBox 宽度（百分比坐标）
  const rowH = 46; // 每阶段高度
  const gap = 10; // 阶段间距（放转化率标注）
  const H = stages.length * rowH + (stages.length - 1) * gap;

  // 每个阶段梯形的上下半宽（按人数比例）。
  const halfW = (v: number) => (Math.max(v, 0) / max) * (W / 2) * 0.92;

  const allZero = stages.every((s) => s.value === 0) && rejected === 0;

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
          const bands = root.querySelectorAll<SVGGElement>('[data-band]');
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
            duration: DUR.base,
            ease: EASE.out,
            stagger: STAGGER.loose,
          })
            .from(
              labels,
              { autoAlpha: 0, x: -8, duration: DUR.fast, stagger: STAGGER.loose },
              '<0.1'
            )
            .from(
              convs,
              { autoAlpha: 0, y: -6, duration: DUR.fast, stagger: STAGGER.loose },
              '<0.05'
            );
        }
      );
    },
    { scope }
  );

  if (allZero) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted">
        暂无数据
      </div>
    );
  }

  return (
    <div ref={scope}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H * 2.6}
          preserveAspectRatio="xMidYMid meet"
        >
          {stages.map((s, i) => {
            const next = stages[i + 1];
            const yTop = i * (rowH + gap);
            const topHalf = halfW(s.value);
            const botHalf = halfW(next ? next.value : s.value);
            const cx = W / 2;
            // 梯形四角：上边按本阶段宽度，下边按下一阶段宽度（收窄感）。
            const pts = [
              [cx - topHalf, yTop],
              [cx + topHalf, yTop],
              [cx + botHalf, yTop + rowH],
              [cx - botHalf, yTop + rowH],
            ]
              .map((p) => p.join(','))
              .join(' ');
            return (
              <g key={s.label} data-band>
                <polygon points={pts} fill={s.color} opacity={0.92} />
              </g>
            );
          })}
        </svg>

        {/* 阶段标签 + 人数（绝对定位覆盖在梯形上） */}
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
                <span className="text-xs font-medium text-white/95 drop-shadow">
                  {s.label}
                </span>
                <span className="font-display text-sm text-white tabular-nums drop-shadow">
                  {s.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* 阶段间转化率标注（右侧） */}
        <div className="pointer-events-none absolute inset-0">
          {stages.slice(0, -1).map((s, i) => {
            const next = stages[i + 1];
            const rate = s.value > 0 ? (next.value / s.value) * 100 : 0;
            const topPct = (((i + 1) * (rowH + gap) - gap / 2) / H) * 100;
            return (
              <div
                key={s.label}
                data-conv
                className="absolute right-1 -translate-y-1/2"
                style={{ top: `${topPct}%` }}
              >
                <span className="rounded-full bg-surface-card px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-body">
                  {rate.toFixed(0)}%
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

// ── 环形转化率仪表 ──────────────────────────────────────────
// SVG 圆环，GSAP 描边 + 中心数字计数。

interface ConversionRingProps {
  /** 0-100 的百分比。 */
  percent: number;
  label?: string;
  size?: number;
  color?: string;
}

export function ConversionRing({
  percent,
  label = '整体转化率',
  size = 160,
  color = '#111111',
}: ConversionRingProps) {
  const scope = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const arc = root.querySelector<SVGCircleElement>('[data-arc]');
      const num = numRef.current;
      if (!arc || !num) return;

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
            num.textContent = clamped.toFixed(1) + '%';
            return;
          }
          gsap.fromTo(
            arc,
            { strokeDashoffset: c },
            { strokeDashoffset: target, duration: DUR.slow, ease: EASE.inOut }
          );
          const obj = { n: 0 };
          gsap.to(obj, {
            n: clamped,
            duration: DUR.slow,
            ease: EASE.out,
            onUpdate: () => {
              num.textContent = obj.n.toFixed(1) + '%';
            },
          });
        }
      );
    },
    { dependencies: [clamped], scope }
  );

  return (
    <div ref={scope} className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
          />
          <circle
            data-arc
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            ref={numRef}
            className="font-display text-2xl text-ink tabular-nums"
          >
            0.0%
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
    </div>
  );
}
