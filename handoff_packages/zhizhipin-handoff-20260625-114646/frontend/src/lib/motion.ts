// 全站动效配置中心 — 统一缓动、时长与无障碍处理。
// 所有 GSAP 动画都应从这里取参数，保证整站节奏一致（Apple 精致基调）。

import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// 注册 useGSAP 插件（在任何 GSAP 代码运行前注册一次）。
gsap.registerPlugin(useGSAP);

// ── 缓动曲线 ────────────────────────────────────────────────
export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  soft: 'power1.out',
  back: 'back.out(1.6)',
  /** Apple spring curve — natural, bouncy but not exaggerated */
  apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Stronger spring for scale-in animations */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Out expo — fast deceleration */
  outExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
} as const;

// ── 时长（秒）──────────────────────────────────────────────
export const DUR = {
  fast: 0.32,
  base: 0.5,
  slow: 0.7,
  number: 1.1,
  shimmer: 1.5,
  /** Apple-style micro-interaction */
  micro: 0.2,
} as const;

// ── stagger 节奏 ───────────────────────────────────────────
export const STAGGER = {
  tight: 0.05,
  base: 0.08,
  loose: 0.12,
} as const;

// 项目级默认 tween 参数。
gsap.defaults({ duration: DUR.base, ease: EASE.out });

// 是否用户偏好减少动效（无障碍）。在浏览器外安全回退为 false。
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── 工具函数 ────────────────────────────────────────────────

/**
 * 对容器内的元素批量 stagger 动画。
 * 用法: staggerItems(containerRef.current, '[data-stagger]', 0.06)
 */
export function staggerItems(
  container: HTMLElement | null,
  selector: string,
  stagger: number = STAGGER.base,
): gsap.core.Timeline | null {
  if (!container) return null;
  const items = container.querySelectorAll<HTMLElement>(selector);
  if (items.length === 0) return null;
  const tl = gsap.timeline();
  tl.from(items, {
    autoAlpha: 0,
    y: 16,
    duration: DUR.base,
    stagger,
    ease: EASE.apple,
  });
  return tl;
}

/**
 * 弹簧缩放动画（用于按钮/卡片按压反馈）
 */
export function springScale(
  target: gsap.TweenTarget,
  from: number = 0.95,
  to: number = 1,
): gsap.core.Tween {
  return gsap.fromTo(target, { scale: from }, { scale: to, duration: DUR.micro, ease: EASE.spring });
}

export { gsap, useGSAP };