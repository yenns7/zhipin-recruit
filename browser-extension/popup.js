// 智聘 · BOSS Cookie 采集器 — popup 逻辑
// 用 chrome.cookies 读取 zhipin.com 全部 cookie（含 HttpOnly 的 wt2/wbg/zp_at），
// 拼成 "k=v; k=v" Cookie 头格式复制到剪贴板，供用户粘贴到智聘平台导入。
// 注意：bookmarklet/document.cookie 读不到 HttpOnly，必须走扩展 cookies API。

const REQUIRED = ["__zp_stoken__", "wt2", "wbg", "zp_at"];
// 覆盖 BOSS 主站与招聘端常见域，确保 HttpOnly 会话 cookie 全部取到
const DOMAINS = ["https://www.zhipin.com/", "https://zhipin.com/"];

const statusEl = document.getElementById("status");
const btn = document.getElementById("grab");

function show(kind, msg) {
  statusEl.className = "status " + kind;
  statusEl.textContent = msg;
}

async function collectCookies() {
  const map = new Map();
  for (const url of DOMAINS) {
    const list = await chrome.cookies.getAll({ url });
    for (const c of list) map.set(c.name, c.value);
  }
  // 兜底：按 domain 再取一次（部分 cookie 仅匹配 .zhipin.com）
  const byDomain = await chrome.cookies.getAll({ domain: "zhipin.com" });
  for (const c of byDomain) if (!map.has(c.name)) map.set(c.name, c.value);
  return map;
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  show("warn", "采集中…");
  try {
    const map = await collectCookies();
    if (map.size === 0) {
      show("err", "未读取到任何 zhipin.com Cookie，请确认已在本浏览器登录 BOSS 招聘端。");
      btn.disabled = false;
      return;
    }
    const missing = REQUIRED.filter((k) => !map.has(k));
    const header = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    await navigator.clipboard.writeText(header);

    if (missing.length) {
      show(
        "warn",
        `已复制 ${map.size} 个 Cookie，但缺少：${missing.join(", ")}。\n` +
          `请在 zhipin.com 完整登录招聘端后重试（若缺 __zp_stoken__，请在招聘端页面操作一次再采集）。`
      );
    } else {
      show("ok", `已复制完整 Cookie（共 ${map.size} 个，必需项齐全）。\n请回到智聘平台粘贴提交。`);
    }
  } catch (e) {
    show("err", "采集失败：" + (e && e.message ? e.message : String(e)));
  } finally {
    btn.disabled = false;
  }
});
