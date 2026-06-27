// ── 智聘 BOSS Cookie 采集扩展 ─────────────────────────────────────
// 功能：读取 BOSS 直聘 Cookie（含 __zp_stoken__），发送到智聘后端保存账号。
// 流程：检测 BOSS 标签页 → 读取 Cookie → POST 到 /boss/login/browser-cookie
//
// __zp_stoken__ 由 BOSS 页面 JS 运行时生成，chrome.cookies API 需要
// 用 url 参数（而非 domain）才能可靠匹配到该 Cookie。

const ZHIPIN_API = 'http://localhost:5001';
const BOSS_DOMAIN = 'zhipin.com';

// 必需 cookie（与后端 REQUIRED_COOKIES 对齐）
const REQUIRED_COOKIES = ['__zp_stoken__', 'wt2', 'wbg', 'zp_at'];

// BOSS 直聘 URL（用于 url-based cookie 查询）
const BOSS_URLS = [
  'https://www.zhipin.com/web/boss/',
  'https://www.zhipin.com/',
  'https://www.zhipin.com/web/geek/',
];

// ── DOM 元素 ────────────────────────────────────────────────────
const statusArea = document.getElementById('status-area');
const cookieList = document.getElementById('cookie-list');
const cookieItems = document.getElementById('cookie-items');
const btnCollect = document.getElementById('btn-collect');
const btnRefresh = document.getElementById('btn-refresh');
const hintArea = document.getElementById('hint-area');

// 手动粘贴区域（可选显示）
let manualArea = null;

// ── 初始化 ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkBosTab();
  btnCollect.addEventListener('click', collectAndSync);
  btnRefresh.addEventListener('click', checkBosTab);
});

// ── 检测 BOSS 标签页 ───────────────────────────────────────────
async function checkBosTab() {
  showLoading('正在检测 BOSS 登录状态…');
  hideHint();

  // 查找 BOSS 直聘标签页
  const tabs = await chrome.tabs.query({ url: ['*://*.zhipin.com/*'] });

  if (tabs.length === 0) {
    showStatus('warning', '未检测到 BOSS 直聘标签页', '请先在浏览器中打开 BOSS 直聘招聘端（zhipin.com），然后重新点击扩展图标。');
    btnCollect.disabled = true;
    showManualPasteOption();
    return;
  }

  // 优先使用招聘端页面
  const bossTab = tabs.find(t => t.url.includes('/web/boss/')) || tabs[0];

  // 读取该标签页的 Cookie
  await readCookies(bossTab);
}

// ── 读取 Cookie ─────────────────────────────────────────────────
async function readCookies(tab) {
  showLoading('正在读取 Cookie…');

  try {
    // 1. 通过 chrome.cookies API 读取 —— 使用 url 参数（比 domain 更可靠）
    //    chrome.cookies.getAll({ url }) 会返回该 URL 下所有可见 cookie，
    //    包括 path=/ 的和 path=/web/boss/ 的。
    let allCookies = [];
    for (const url of BOSS_URLS) {
      try {
        const cookies = await chrome.cookies.getAll({ url });
        allCookies.push(...cookies);
      } catch {}
    }
    // 去重（同一个 cookie 可能被多个 URL 匹配到）
    const cookieMap = {};
    for (const c of allCookies) {
      cookieMap[c.name] = c.value;
    }

    // 2. 尝试通过 content script 读取 __zp_stoken__（页面 JS 上下文）
    let contentStoken = null;
    if (tab.url && tab.url.includes('zhipin.com')) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStoken' });
        if (response && response.stoken) {
          contentStoken = response.stoken;
        }
      } catch (e) {
        // content script 可能未加载，尝试注入后重试
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          // 等待 content script 初始化
          await new Promise(r => setTimeout(r, 500));
          const retryResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getStoken' });
          if (retryResponse && retryResponse.stoken) {
            contentStoken = retryResponse.stoken;
          }
        } catch {
          // 注入也失败，忽略
        }
      }
    }

    // 3. 也尝试从 BOSS 标签页的 JS 上下文直接提取 stoken
    if (!contentStoken && tab.url && tab.url.includes('zhipin.com')) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // 尝试从页面全局状态中提取 stoken
            const sources = [
              window.__INITIAL_STATE__,
              window.__NEXT_DATA__,
              window.__NUXT__,
              window.__APP_DATA__,
              window.__zhipin_state__,
              window.__BOSS__,
              window.__store__,
            ];
            for (const obj of sources) {
              if (!obj || typeof obj !== 'object') continue;
              try {
                const json = JSON.stringify(obj);
                const match = json.match(/"__zp_stoken__"\s*:\s*"([^"]+)"/);
                if (match) return match[1];
              } catch {}
            }
            // 尝试 document.cookie
            const cookies = document.cookie.split(';');
            for (const c of cookies) {
              const t = c.trim();
              if (t.startsWith('__zp_stoken__=')) {
                return t.substring('__zp_stoken__='.length);
              }
            }
            return null;
          },
        });
        if (results?.[0]?.result) {
          contentStoken = results[0].result;
        }
      } catch {}
    }

    // 4. 合并 stoken 到 cookieMap
    if (contentStoken && !cookieMap['__zp_stoken__']) {
      cookieMap['__zp_stoken__'] = contentStoken;
    }

    // 5. 渲染 cookie 列表
    renderCookieList(cookieMap);

    // 6. 检查必需 cookie
    const missing = REQUIRED_COOKIES.filter(name => !cookieMap[name]);

    if (allCookies.length === 0 && !contentStoken) {
      showStatus('error', '未检测到 Cookie', '请确认已在当前浏览器登录 BOSS 直聘，并访问招聘端页面。');
      btnCollect.disabled = true;
      showManualPasteOption();
    } else if (missing.length > 0) {
      const missingNames = missing.join(', ');
      showStatus(
        'warning',
        `缺少 ${missing.length} 个必需 Cookie`,
        `缺少：${missingNames}。请在 BOSS 直聘招聘端页面刷新一下（如点击「推荐」），等待 3-5 秒后再次点击「刷新状态」。`
      );
      btnCollect.disabled = true;
      // 3秒后自动刷新
      setTimeout(() => readCookies(tab), 3000);
    } else {
      showStatus('success', 'Cookie 完整，可以采集', `共 ${Object.keys(cookieMap).length} 个 Cookie，包含全部必需项。`);
      btnCollect.disabled = false;
      // 存储 cookie 供采集使用
      window._collectedCookies = cookieMap;
    }
  } catch (e) {
    showStatus('error', '读取 Cookie 失败', e.message);
    btnCollect.disabled = true;
  }
}

// ── 采集并同步到后端 ───────────────────────────────────────────
async function collectAndSync() {
  const cookies = window._collectedCookies;
  if (!cookies) {
    showHint('error', '没有可采集的 Cookie');
    return;
  }

  btnCollect.disabled = true;
  btnCollect.innerHTML = '<div class="spinner btn-spinner"></div> 正在同步…';
  showHint('info', '正在将 Cookie 发送到智聘后端…');

  // 拼接 cookie 字符串
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  try {
    // 获取智聘的 auth token
    const token = await getZhipinToken();
    if (!token) {
      showHint('error', '未找到智聘登录凭证。请先在智聘系统中登录，然后重新点击扩展。');
      btnCollect.disabled = false;
      btnCollect.innerHTML = '<span class="btn-icon">📡</span> 一键采集并同步到智聘';
      return;
    }

    // POST 到后端
    const resp = await fetch(`${ZHIPIN_API}/api/boss/login/browser-cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        cookies: cookieStr,
        label: `扩展采集 ${new Date().toLocaleDateString()}`,
      }),
    });

    const data = await resp.json();

    if (data.ok) {
      showStatus('success', '✅ 同步成功！', 'Cookie 已保存到智聘系统，全功能已解锁。');
      showHint('success', '现在可以回到智聘系统使用全部功能了。');
      // 通知 background 刷新状态
      chrome.runtime.sendMessage({ action: 'syncComplete', success: true });
    } else {
      const errMsg = data.error?.message || '同步失败';
      showStatus('error', '同步失败', errMsg);

      if (data.error?.code === 'needs_stoken') {
        showHint('warning', 'Cookie 中缺少 __zp_stoken__。请在 BOSS 直聘招聘端页面操作一次（如刷新推荐），等待几秒后再试。');
      } else if (data.error?.code === 'not_authenticated') {
        showHint('warning', 'Cookie 已过期。请在浏览器中重新登录 BOSS 直聘。');
      } else {
        showHint('error', errMsg);
      }
      btnCollect.disabled = false;
    }
  } catch (e) {
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      showStatus('error', '无法连接智聘后端', `请确认智聘系统已启动（${ZHIPIN_API}）。`);
    } else {
      showStatus('error', '同步异常', e.message);
    }
    btnCollect.disabled = false;
  }

  btnCollect.innerHTML = '<span class="btn-icon">📡</span> 一键采集并同步到智聘';
}

// ── 手动粘贴 Cookie（兜底方案）─────────────────────────────────
function showManualPasteOption() {
  if (manualArea) return;

  const area = document.createElement('div');
  area.className = 'manual-paste-area';
  area.innerHTML = `
    <div class="manual-paste-toggle" id="manual-toggle">
      <span>📋 手动粘贴 Cookie（兜底方案）</span>
    </div>
    <div class="manual-paste-form" id="manual-form" style="display:none">
      <textarea id="manual-cookies" placeholder="从浏览器开发者工具复制 Cookie 粘贴到这里&#10;格式：name1=value1; name2=value2; ..." rows="4"></textarea>
      <button id="btn-manual-sync" class="btn btn-primary" style="margin-top:8px">
        <span class="btn-icon">📡</span> 同步到智聘
      </button>
    </div>
  `;

  // 插入到 actions 区域之后
  const actionsEl = document.querySelector('.actions');
  if (actionsEl) {
    actionsEl.parentNode.insertBefore(area, actionsEl.nextSibling);
  }

  manualArea = area;

  // 绑定事件
  document.getElementById('manual-toggle').addEventListener('click', () => {
    const form = document.getElementById('manual-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btn-manual-sync').addEventListener('click', async () => {
    const raw = document.getElementById('manual-cookies').value.trim();
    if (!raw) {
      showHint('error', '请粘贴 Cookie 字符串');
      return;
    }

    // 解析 cookie 字符串为对象
    const cookieMap = {};
    const pairs = raw.split(';');
    for (const pair of pairs) {
      const [name, ...valueParts] = pair.trim().split('=');
      if (name && valueParts.length > 0) {
        cookieMap[name.trim()] = valueParts.join('=').trim();
      }
    }

    if (Object.keys(cookieMap).length === 0) {
      showHint('error', '未能解析出任何 Cookie，请检查格式');
      return;
    }

    window._collectedCookies = cookieMap;
    renderCookieList(cookieMap);

    // 自动触发同步
    await collectAndSync();
  });
}

// ── 获取智聘 Token ──────────────────────────────────────────────
async function getZhipinToken() {
  // 尝试从 chrome.storage 获取
  const stored = await chrome.storage.local.get('zhipin_token');
  if (stored.zhipin_token) return stored.zhipin_token;

  // 尝试从智聘页面的 localStorage 获取
  try {
    const zhipingTabs = await chrome.tabs.query({ url: ['*://localhost:5173/*', '*://localhost:5001/*'] });
    for (const tab of zhipingTabs) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // 尝试多种 key 名
            const keys = ['auth_token', 'token', 'access_token', 'jwt_token', 'boss_token'];
            for (const key of keys) {
              const val = localStorage.getItem(key);
              if (val) return val;
            }
            // 也尝试从 sessionStorage
            for (const key of keys) {
              const val = sessionStorage.getItem(key);
              if (val) return val;
            }
            // 尝试从 cookie 中提取
            const cookies = document.cookie.split(';');
            for (const c of cookies) {
              const t = c.trim();
              if (t.startsWith('auth_token=') || t.startsWith('token=')) {
                return t.split('=').slice(1).join('=');
              }
            }
            return null;
          },
        });
        if (results?.[0]?.result) {
          const token = results[0].result;
          await chrome.storage.local.set({ zhipin_token: token });
          return token;
        }
      } catch {}
    }
  } catch {}

  // 尝试从智聘页面的 cookie 中读取 auth token
  try {
    const authCookies = await chrome.cookies.getAll({ url: 'http://localhost:5001' });
    for (const c of authCookies) {
      if (c.name === 'auth_token' || c.name === 'token' || c.name === 'access_token') {
        await chrome.storage.local.set({ zhipin_token: c.value });
        return c.value;
      }
    }
  } catch {}

  return null;
}

// ── 渲染 Cookie 列表 ──────────────────────────────────────────
function renderCookieList(cookieMap) {
  cookieItems.innerHTML = '';
  const names = Object.keys(cookieMap).sort((a, b) => {
    // 必需 cookie 排前面
    const aReq = REQUIRED_COOKIES.includes(a) ? 0 : 1;
    const bReq = REQUIRED_COOKIES.includes(b) ? 0 : 1;
    return aReq - bReq;
  });

  for (const name of names) {
    const isRequired = REQUIRED_COOKIES.includes(name);
    const item = document.createElement('div');
    item.className = `cookie-item ${isRequired ? 'required' : ''}`;
    item.innerHTML = `
      <span class="cookie-name">${isRequired ? '🔑 ' : ''}${name}</span>
      <span class="cookie-value">${cookieMap[name].substring(0, 20)}${cookieMap[name].length > 20 ? '…' : ''}</span>
    `;
    cookieItems.appendChild(item);
  }

  cookieList.style.display = 'block';
}

// ── UI 辅助函数 ─────────────────────────────────────────────────
function showLoading(text) {
  statusArea.innerHTML = `
    <div class="status-loading">
      <div class="spinner"></div>
      <span>${text}</span>
    </div>
  `;
}

function showStatus(type, title, detail) {
  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
  statusArea.innerHTML = `
    <div class="status-${type}">
      <div class="status-title">${icons[type] || ''} ${title}</div>
      ${detail ? `<div class="status-detail">${detail}</div>` : ''}
    </div>
  `;
}

function showHint(type, text) {
  hintArea.style.display = 'block';
  hintArea.className = `hint-area hint-${type}`;
  hintArea.textContent = text;
}

function hideHint() {
  hintArea.style.display = 'none';
}
