// 全站动效配置中心 — 统一缓动、时长与无障碍处理。
// 所有 GSAP 动画都应从这里取参数，保证整站节奏一致（Cal.com 克制精致基调）。

import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

// 注册 useGSAP 插件（在任何 GSAP 代码运行前注册一次）。
gsap.registerPlugin(useGSAP);

// ── 缓动曲线 ────────────────────────────────────────────────
// 克制精致：以 power 系列为主，弹性仅用于 logo/徽章等点睛处。
export const EASE = {
  out: 'power3.out', // 通用进场
  inOut: 'power2.inOut', // 过渡
  soft: 'power1.out', // 细微位移
  back: 'back.out(1.6)', // 弹入（logo、徽章）
} as const;

// ── 时长（秒）──────────────────────────────────────────────
export const DUR = {
  fast: 0.32,
  base: 0.5,
  slow: 0.7,
  number: 1.1, // 数字滚动
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

export { gsap, useGSAP };
