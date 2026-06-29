// ── 智聘 BOSS Cookie 采集扩展 (v4.0.0) ──────────────────────────
// 流程：webRequest 抓请求 Cookie 头 → 校验 → 直接发送到后端 / 复制到剪贴板
// 支持两种模式：HTTP 直发（推荐）+ 剪贴板复制（兼容）

// Tier-1 功能所需的 cookie（__zp_stoken__ 已不再强制要求）
const REQUIRED_COOKIES = ['wt2', 'wbg', 'zp_at'];

// ── DOM ─────────────────────────────────────────────────────────
const statusBox    = document.getElementById('status-box');
const statusIcon   = document.getElementById('status-icon');
const statusTitle  = document.getElementById('status-title');
const statusDetail = document.getElementById('status-detail');
const btnSend      = document.getElementById('btn-send');
const btnCollect   = document.getElementById('btn-collect');
const btnRefresh   = document.getElementById('btn-refresh');
const hintBox      = document.getElementById('hint-box');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel  = document.getElementById('settings-panel');
const serverUrlInput = document.getElementById('server-url');
const authTokenInput = document.getElementById('auth-token');
const btnSaveUrl   = document.getElementById('btn-save-url');
const btnSaveToken = document.getElementById('btn-save-token');

// ── 配置管理 ─────────────────────────────────────────────────────
let config = {
  serverUrl: 'http://localhost:5000',
  authToken: ''
};

// 加载保存的配置
async function loadConfig() {
  try {
    const saved = await chrome.storage.local.get(['serverUrl', 'authToken']);
    if (saved.serverUrl) config.serverUrl = saved.serverUrl;
    if (saved.authToken) config.authToken = saved.authToken;
    serverUrlInput.value = config.serverUrl;
    authTokenInput.value = config.authToken;
  } catch (e) {
    console.error('加载配置失败:', e);
  }
}

// 保存配置
async function saveConfig() {
  config.serverUrl = serverUrlInput.value.replace(/\/+$/, '');
  config.authToken = authTokenInput.value.trim();
  try {
    await chrome.storage.local.set(config);
    showHint('success', '✅ 配置已保存');
  } catch (e) {
    showHint('error', '❌ 保存配置失败');
  }
}

// ── UI 工具 ─────────────────────────────────────────────────────
function setStatus(type, title, detail) {
  const icons = { success: '✅', warning: '⚠️', error: '❌', loading: '⏳' };
  statusBox.className = 'status-box status-' + type;
  statusIcon.textContent = icons[type] || '⏳';
  statusTitle.textContent = title;
  statusDetail.textContent = detail || '';
  statusDetail.style.display = detail ? 'block' : 'none';
}

function showHint(type, msg) {
  hintBox.className = 'hint hint-' + type;
  hintBox.innerHTML = msg;
  hintBox.style.display = 'block';
  // 成功提示 5 秒后自动隐藏
  if (type === 'success') {
    setTimeout(() => { hintBox.style.display = 'none'; }, 5000);
  }
}

// ── 核心：检查 + 读取 ──────────────────────────────────────────
async function checkBosTab() {
  setStatus('loading', '正在检测 BOSS 登录状态…');
  hintBox.style.display = 'none';
  btnSend.disabled = true;
  btnCollect.disabled = true;

  const tabs = await chrome.tabs.query({ url: ['*://*.zhipin.com/*'] });
  if (tabs.length === 0) {
    setStatus('warning', '未检测到 BOSS 直聘标签页', '请先打开 BOSS 直聘招聘端（zhipin.com）并登录。');
    return;
  }
  await readCookies(tabs.find(t => t.url.includes('/web/')) || tabs[0]);
}

async function readCookies(tab) {
  setStatus('loading', '正在读取 Cookie…');
  const cookieMap = {};

  // 从 background 取 webRequest 抓到的 Cookie 请求头
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getCapturedCookie' });
    if (resp && resp.cookieHeader) {
      for (const part of resp.cookieHeader.split(';')) {
        const idx = part.indexOf('=');
        if (idx <= 0) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) cookieMap[k] = v;
      }
    }
  } catch (e) { /* background 未就绪 */ }

  // 校验并渲染
  const missing = REQUIRED_COOKIES.filter(n => !cookieMap[n]);
  const total = Object.keys(cookieMap).length;

  if (total === 0) {
    setStatus('error', '未抓到 Cookie',
      '请在 BOSS 招聘端页面刷新一次或点开「推荐 / 沟通」触发请求，再点「刷新状态」。');
  } else if (missing.length > 0) {
    const hint = missing.includes('zp_at') || missing.includes('wt2')
      ? '请刷新页面或点开「推荐/沟通」触发请求后，点「刷新状态」。'
      : '请在招聘工作台点开「推荐」等待几秒后重试。';
    setStatus('warning', '缺少 ' + missing.length + ' 个必需 Cookie',
      '缺少：' + missing.join(', ') + '\n已读到：' + Object.keys(cookieMap).sort().join(', ') + '\n' + hint);
  } else {
    setStatus('success', 'Cookie 完整，可以采集', '共 ' + total + ' 个 Cookie，包含全部必需项。');
    btnSend.disabled = false;
    btnCollect.disabled = false;
    window._collectedCookies = cookieMap;
  }
}

// ── 格式化 Cookie 字符串 ────────────────────────────────────────
function formatCookies(cookies) {
  return REQUIRED_COOKIES
    .concat(Object.keys(cookies).filter(k => !REQUIRED_COOKIES.includes(k)))
    .filter(k => cookies[k])
    .map(k => k + '=' + cookies[k])
    .join('; ');
}

// ── 直接发送到后端 ──────────────────────────────────────────────
async function sendToBackend() {
  const cookies = window._collectedCookies;
  if (!cookies) return;

  if (!config.serverUrl) {
    showHint('error', '❌ 请先在设置中配置智聘平台地址');
    settingsPanel.style.display = 'block';
    return;
  }

  if (!config.authToken) {
    showHint('error', '❌ 请先在设置中配置登录 Token');
    settingsPanel.style.display = 'block';
    return;
  }

  btnSend.disabled = true;
  btnSend.innerHTML = '<span class="btn-icon">⏳</span> 发送中…';

  const cookieStr = formatCookies(cookies);

  try {
    const response = await fetch(`${config.serverUrl}/api/boss/login/browser-cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.authToken}`
      },
      body: JSON.stringify({
        cookies: cookieStr,
        label: `浏览器导入 ${new Date().toLocaleString()}`
      })
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      showHint('success', '✅ <strong>发送成功！</strong><br>账号已导入并激活，可直接在智聘平台使用 BOSS 功能。');
      // 成功后 3 秒关闭弹窗
      setTimeout(() => window.close(), 3000);
    } else {
      const errMsg = data.error?.message || '未知错误';
      showHint('error', `❌ 发送失败：${errMsg}`);
    }
  } catch (e) {
    showHint('error', `❌ 网络错误：${e.message}<br>请检查智聘平台地址是否正确，以及平台是否已启动。`);
  } finally {
    btnSend.disabled = false;
    btnSend.innerHTML = '<span class="btn-icon">🚀</span> 一键发送到智聘';
  }
}

// ── 复制到剪贴板（兼容模式）──────────────────────────────────────
async function collectAndCopy() {
  const cookies = window._collectedCookies;
  if (!cookies) return;

  const text = formatCookies(cookies);

  try {
    await navigator.clipboard.writeText(text);
    showHint('success', '✅ 已复制 ' + Object.keys(cookies).length + ' 个 Cookie 到剪贴板！<br>回智聘「从浏览器导入账号」粘贴即可。');
  } catch {
    showHint('warning', '⚠️ 自动复制失败，请手动复制下方文本：');
    let box = document.getElementById('manual-copy');
    if (!box) {
      box = document.createElement('textarea');
      box.id = 'manual-copy';
      box.readOnly = true;
      box.rows = 4;
      box.style.cssText = 'width:100%;margin-top:8px;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:monospace;font-size:11px;';
      hintBox.parentNode.appendChild(box);
    }
    box.value = text;
    box.style.display = 'block';
    box.focus();
    box.select();
  }
}

// ── 事件绑定 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  checkBosTab();

  btnSend.addEventListener('click', sendToBackend);
  btnCollect.addEventListener('click', collectAndCopy);
  btnRefresh.addEventListener('click', checkBosTab);

  settingsToggle.addEventListener('click', () => {
    const isOpen = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isOpen ? 'none' : 'block';
    settingsToggle.classList.toggle('active', !isOpen);
  });

  btnSaveUrl.addEventListener('click', saveConfig);
  btnSaveToken.addEventListener('click', saveConfig);
});
