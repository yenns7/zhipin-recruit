// 进场动画容器 — 子元素挂载时淡入+上浮，支持 stagger 级联。
// 用法：<Reveal> 直接包裹一组卡片/行，它们会依次进场。
// 尊重 prefers-reduced-motion：偏好减少动效时直接显示，不做位移。

import { useRef, type ReactNode, type ElementType } from 'react';
import { gsap, useGSAP, EASE, DUR, STAGGER } from '../../lib/motion';

interface RevealProps {
  children: ReactNode;
  /** 子元素 stagger 间隔（秒）。默认 base。 */
  stagger?: number;
  /** 进场上浮距离（px）。 */
  y?: number;
  /** 整体延迟（秒）。 */
  delay?: number;
  /** 渲染的标签，默认 div。 */
  as?: ElementType;
  className?: string;
  /**
   * 选择直接子元素的 CSS 选择器。默认 ':scope > *'（所有直接子元素）。
   * 传入自定义选择器可只动画特定子项。
   */
  selector?: string;
}

export function Reveal({
  children,
  stagger = STAGGER.base,
  y = 16,
  delay = 0,
  as: Tag = 'div',
  className,
  selector = ':scope > *',
}: RevealProps) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const targets = root.querySelectorAll<HTMLElement>(selector);
      if (targets.length === 0) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          const { reduce } = ctx.conditions as { reduce: boolean };
          if (reduce) {
            // 无障碍：仅淡入，无位移、无 stagger。
            gsap.from(targets, { autoAlpha: 0, duration: DUR.fast });
            return;
          }
          gsap.from(targets, {
            autoAlpha: 0,
            y,
            duration: DUR.base,
            ease: EASE.out,
            stagger,
            delay,
          });
        }
      );
    },
    { scope }
  );

  return (
    <Tag ref={scope} className={className}>
      {children}
    </Tag>
  );
}
