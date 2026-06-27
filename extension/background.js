// ── Background Service Worker ─────────────────────────────────────
// 监听 BOSS 直聘 Cookie 变化，自动提示用户采集。
// 使用 url 参数查询 cookie（比 domain 更可靠）。

// BOSS 直聘 URL 列表
const BOSS_URLS = [
  'https://www.zhipin.com/web/boss/',
  'https://www.zhipin.com/',
];

// 当用户打开/刷新 BOSS 页面时，检查 Cookie 是否完整
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.includes('zhipin.com')) return;

  try {
    // 使用 url 参数查询（比 domain 更可靠）
    const cookieMap = {};
    for (const url of BOSS_URLS) {
      try {
        const cookies = await chrome.cookies.getAll({ url });
        for (const c of cookies) {
          cookieMap[c.name] = c.value;
        }
      } catch {}
    }

    const cookieNames = Object.keys(cookieMap);
    const hasStoken = cookieNames.includes('__zp_stoken__');
    const hasAll = ['wt2', 'wbg', 'zp_at'].every(n => cookieNames.includes(n));

    if (hasAll && !hasStoken) {
      // 有会话 cookie 但缺 stoken，设置 badge 提示
      chrome.action.setBadgeText({ text: '🔑', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
    } else if (hasAll && hasStoken) {
      // 完整，清除 badge
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (e) {
    console.error('Cookie 检查失败:', e);
  }
});

// 监听 popup 发来的同步完成消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'syncComplete' && msg.success) {
    // 同步成功，清除所有 badge
    chrome.tabs.query({ url: ['*://*.zhipin.com/*'] }, (tabs) => {
      for (const tab of tabs) {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    });
  }
});
