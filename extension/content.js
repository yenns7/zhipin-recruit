// ── Content Script: 注入 BOSS 直聘页面 ────────────────────────────
// 在 BOSS 直聘页面运行，从多种来源提取 __zp_stoken__。
//
// __zp_stoken__ 是 BOSS 直聘的客户端反爬 token，由页面 JS 运行时生成。
// chrome.cookies.getAll 可能因 domain/path 匹配问题读不到，
// 此脚本从页面上下文中兜底提取，确保扩展能采集到完整 Cookie。

(() => {
  'use strict';

  // ── 消息监听 ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getStoken') {
      // 立即尝试提取
      const stoken = extractStoken();
      if (stoken) {
        sendResponse({ stoken });
        return false;
      }
      // 如果立即提取不到，延迟重试（等待页面 JS 生成 token）
      setTimeout(() => {
        const retryStoken = extractStoken();
        sendResponse({ stoken: retryStoken });
      }, 1500);
      return true; // 异步 sendResponse
    }
    return false;
  });

  // ── 核心提取逻辑 ──────────────────────────────────────────────
  function extractStoken() {
    // 方法 1：从 document.cookie 解析（__zp_stoken__ 如果非 HttpOnly，JS 可读）
    const fromCookie = getFromDocumentCookie();
    if (fromCookie) return fromCookie;

    // 方法 2：从 localStorage / sessionStorage 查找
    const fromStorage = getFromStorage();
    if (fromStorage) return fromStorage;

    // 方法 3：从页面全局变量查找（React/Next.js 状态）
    const fromGlobal = getFromGlobalState();
    if (fromGlobal) return fromGlobal;

    // 方法 4：从 DOM 元素的 data 属性查找
    const fromDom = getFromDom();
    if (fromDom) return fromDom;

    return null;
  }

  // ── 方法 1：document.cookie ────────────────────────────────────
  function getFromDocumentCookie() {
    try {
      const raw = document.cookie;
      if (!raw) return null;
      const cookies = raw.split(';');
      for (const cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith('__zp_stoken__=')) {
          const value = trimmed.substring('__zp_stoken__='.length);
          if (value) return value;
        }
      }
    } catch (e) {
      // 忽略安全限制
    }
    return null;
  }

  // ── 方法 2：localStorage / sessionStorage ──────────────────────
  function getFromStorage() {
    try {
      // 检查 localStorage 中所有 key
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('stoken') || key.includes('zp_stoken') || key.includes('token'))) {
          const val = localStorage.getItem(key);
          if (val && val.length > 10 && val.length < 500) {
            // 可能是 token 值
            return val;
          }
        }
      }
    } catch (e) { /* 忽略 */ }

    try {
      // 检查 sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes('stoken') || key.includes('zp_stoken') || key.includes('token'))) {
          const val = sessionStorage.getItem(key);
          if (val && val.length > 10 && val.length < 500) {
            return val;
          }
        }
      }
    } catch (e) { /* 忽略 */ }

    return null;
  }

  // ── 方法 3：全局变量 ──────────────────────────────────────────
  function getFromGlobalState() {
    try {
      const candidates = [
        window.__INITIAL_STATE__,
        window.__NEXT_DATA__,
        window.__NUXT__,
        window.__APP_DATA__,
        window.__zhipin_state__,
        window.__BOSS__,
        window.__store__,
      ];

      for (const obj of candidates) {
        if (!obj || typeof obj !== 'object') continue;
        const found = deepSearch(obj, '__zp_stoken__', 4);
        if (found && typeof found === 'string') return found;
      }

      // 也搜索 window 上直接挂的属性
      for (const key of Object.keys(window)) {
        if (key.startsWith('__') && key.endsWith('__') && typeof window[key] === 'object') {
          const found = deepSearch(window[key], '__zp_stoken__', 3);
          if (found && typeof found === 'string') return found;
        }
      }
    } catch (e) { /* 忽略跨域 */ }

    return null;
  }

  // ── 方法 4：DOM data 属性 ─────────────────────────────────────
  function getFromDom() {
    try {
      // 检查 meta 标签
      const metas = document.querySelectorAll('meta[name*="token"], meta[name*="stoken"]');
      for (const meta of metas) {
        const content = meta.getAttribute('content');
        if (content && content.length > 10) return content;
      }

      // 检查 hidden input
      const inputs = document.querySelectorAll('input[type="hidden"][name*="token"], input[type="hidden"][name*="stoken"]');
      for (const input of inputs) {
        if (input.value && input.value.length > 10) return input.value;
      }

      // 检查 data-stoken 属性
      const elements = document.querySelectorAll('[data-stoken], [data-token], [data-zp-stoken]');
      for (const el of elements) {
        const val = el.dataset.stoken || el.dataset.token || el.dataset.zpStoken;
        if (val && val.length > 10) return val;
      }
    } catch (e) { /* 忽略 */ }

    return null;
  }

  // ── 工具函数 ──────────────────────────────────────────────────
  function deepSearch(obj, key, maxDepth, depth = 0) {
    if (depth >= maxDepth || !obj || typeof obj !== 'object') return null;
    try {
      if (key in obj) return obj[key];
      for (const k of Object.keys(obj)) {
        try {
          const result = deepSearch(obj[k], key, maxDepth, depth + 1);
          if (result) return result;
        } catch { /* 忽略不可访问的属性 */ }
      }
    } catch { /* 忽略 */ }
    return null;
  }

  // ── 页面加载后延迟提取并缓存 ──────────────────────────────────
  // 等页面 JS 运行一段时间后再尝试一次，结果缓存到 window 上供后续查询
  let _cachedStoken = null;
  function tryCacheStoken() {
    if (_cachedStoken) return;
    const stoken = extractStoken();
    if (stoken) {
      _cachedStoken = stoken;
      // 也缓存到 window 上，方便调试
      try { window.__zb_stoken_cache__ = stoken; } catch {}
    }
  }

  // 页面加载后 2 秒和 5 秒各尝试一次
  setTimeout(tryCacheStoken, 2000);
  setTimeout(tryCacheStoken, 5000);

  // 监听 DOM 变化（BOSS SPA 路由切换后可能重新生成 token）
  try {
    const observer = new MutationObserver(() => {
      if (!_cachedStoken) {
        tryCacheStoken();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // 10 秒后停止观察（避免性能问题）
    setTimeout(() => observer.disconnect(), 10000);
  } catch {}
})();
