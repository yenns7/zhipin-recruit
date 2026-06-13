// 数字滚动递增 — KPI 统计数字从 0 滚动到目标值。
// 尊重 prefers-reduced-motion：偏好减少动效时直接显示终值。

import { useRef } from 'react';
import { gsap, useGSAP, EASE, DUR } from '../../lib/motion';

interface AnimatedNumberProps {
  /** 目标数值。 */
  value: number;
  /** 小数位数，默认 0（整数）。 */
  decimals?: number;
  /** 前缀（如货币符号）。 */
  prefix?: string;
  /** 后缀（如 % / 人）。 */
  suffix?: string;
  /** 滚动时长（秒）。 */
  duration?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = DUR.number,
  className,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);

  const format = (n: number) =>
    `${prefix}${n.toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const { reduce } = ctx.conditions as { reduce: boolean };
          if (reduce) {
            el.textContent = format(value);
            return;
          }
          const obj = { n: 0 };
          gsap.to(obj, {
            n: value,
            duration,
            ease: EASE.out,
            onUpdate: () => {
              el.textContent = format(obj.n);
            },
          });
        }
      );
    },
    { dependencies: [value], scope: ref }
  );

  // 初始渲染终值，避免 SSR/首帧空白（GSAP 随后接管动画）。
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
