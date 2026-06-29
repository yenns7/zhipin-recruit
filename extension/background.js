// ── Background Service Worker (v3.0.0) ────────────────────────────
// 用 chrome.webRequest 监听发往 BOSS 直聘的请求，从请求头里抓取完整 Cookie。
// 不依赖 chrome.cookies API（该 API 在受管控环境下可能失效）。

// 缓存最近一次发往 zhipin.com 的请求 Cookie 头
let lastCookieHeader = '';
let lastCapturedAt = 0;

const ZHIPIN_FILTER = { urls: ['*://*.zhipin.com/*'] };

// 监听请求头：MV3 下需要 'requestHeaders' + 'extraHeaders' 才能拿到 Cookie 头
try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const headers = details.requestHeaders || [];
      for (const h of headers) {
        if (h.name.toLowerCase() === 'cookie' && h.value) {
          if (h.value.includes('zp_at') || h.value.includes('wt2')) {
            lastCookieHeader = h.value;
            lastCapturedAt = Date.now();
          }
          break;
        }
      }
    },
    ZHIPIN_FILTER,
    ['requestHeaders', 'extraHeaders']
  );
} catch (e) {
  console.error('webRequest 监听注册失败:', e);
}

// 响应 popup 取 Cookie 头的请求
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getCapturedCookie') {
    sendResponse({ cookieHeader: lastCookieHeader, capturedAt: lastCapturedAt });
  }
  return false;
});

// BOSS 页面加载后设置 badge 提示
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.includes('zhipin.com')) return;
  const hasSession = lastCookieHeader.includes('zp_at') && lastCookieHeader.includes('wt2');
  if (hasSession) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#16A34A', tabId });
  }
});
