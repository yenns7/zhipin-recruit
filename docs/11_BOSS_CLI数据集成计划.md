# BOSS CLI 数据集成计划

> 版本：v1.0 | 日期：2026-06-29 | 状态：待实施

## 1. 背景

boss-cli（kabi-boss-cli）提供了完整的 BOSS 直聘招聘端能力。当前系统只接入了一半：收件箱列表、推荐候选人、简历下载（Markdown）、职位列表、批量导入 + AI 初筛。

以下能力未接入：候选人标签、聊天记录、结构化简历、候选人搜索、发消息、请求简历、交换联系方式。这些数据散落在 boss-cli 命令里，没有流入系统的候选人库、AI 筛选、BI 看板等环节。

本文档梳理所有可接入的功能，按优先级分 Phase 实施。

---

## 2. 现状：已接入 vs 未接入

### 2.1 已接入（数据已流转）

| 能力 | 后端方法 | API 端点 | 前端使用 | 数据去向 |
|------|----------|----------|----------|----------|
| 登录态检测 | `status()` | `GET /boss/status` | BossPage 状态栏 | — |
| 职位列表 | `recruiter_jobs()` | `GET /boss/jobs` | BossPage 岗位 tab | — |
| 收件箱列表 | `recruiter_inbox()` | `GET /boss/candidates/inbox` | BossInboxWorkbench | 勾选后批量导入 |
| 推荐候选人 | `recruiter_recommend()` | `GET /boss/candidates/recommend` | BossPage 推荐 tab | 查看/下载简历 |
| 简历详情（JSON） | `recruiter_resume()` | `GET /boss/candidates/:id/resume` | BossPage 简历弹窗 | — |
| 简历下载（Markdown） | `recruiter_resume_download()` | `GET /boss/candidates/:id/resume/download` | 下载按钮 | 批量导入时存入 `resume_json.raw_markdown` |
| 批量导入 | `BossPipelineService.batch_import()` | `POST /boss/candidates/batch-import` | BossInboxWorkbench | 创建 Candidate 记录 |
| AI 初筛 | `BossPipelineService.ai_screen()` | `POST /boss/candidates/ai-screen` | BossInboxWorkbench | 写 Interview + 推进 ai_screen 阶段 |
| 账号管理 | CRUD 方法 | `GET/POST/DELETE /boss/accounts/*` | BossAccountManager | BossAccount 表 |

### 2.2 未接入（数据断点）

| 能力 | boss-cli 命令 | 断在哪里 | 潜在价值 |
|------|--------------|----------|----------|
| 候选人标签 | `recruiter labels` | 未调用 | 收件箱标签写死 3 个，无法按自定义标签筛选 |
| 聊天记录 | `recruiter chat <friendId>` | 未调用 | 批量导入只存简历，丢掉了薪资谈判、候选人动机等沟通上下文 |
| 结构化简历 | `recruiter resume`（JSON 格式） | 批量导入时未调用 | 只存了 Markdown 原文，技能/经历无法自动提取为标签 |
| 候选人搜索 | `recruiter search "keyword" --city X` | 未实现 | 用户只能被动看推荐/收件箱，不能主动搜索 |
| 发消息 | `recruiter reply <fid> <msg>` | 未实现 | 无法在系统内回复候选人 |
| 请求简历 | `recruiter request-resume <fid>` | 未实现 | 无法主动请求候选人投递 |
| 交换联系方式 | `recruiter exchange-phone/wechat <fid>` | 未实现 | 无法在系统内交换联系方式 |
| 标记不合适 | `recruiter mark-unsuitable <gid>` | 未实现 | 无法在系统内标记淘汰 |
| 导出候选人 | `recruiter export` | 未实现 | 无法批量导出 BOSS 候选人数据 |

---

## 3. 集成方案

### Phase 1：标签动态加载

**目标**：收件箱标签从 boss-cli 动态获取，替代写死的 3 个选项。

**改动文件**：
- `backend/app/services/boss_service.py` — 新增 `recruiter_labels()` 方法
- `backend/app/api/boss.py` — 新增 `GET /boss/labels` 端点
- `frontend/src/features/boss/pages/BossInboxWorkbench.tsx` — 标签从 API 加载
- `frontend/src/lib/api.ts` — 新增 `bossLabels()` 方法
- `frontend/src/types/index.ts` — 新增 `BossLabel` 类型

**后端实现**：
```python
# boss_service.py
def recruiter_labels(self, cookies_override=None):
    return _run(["recruiter", "labels"], timeout=30, cookies_override=cookies_override)
```

```python
# boss.py
@bp.get("/boss/labels")
@require_auth
@require_role(*_RECRUITER_ROLES)
def boss_labels():
    cookies, err = _active_cookies_or_409()
    if err is not None:
        return err
    return _ok_or_fail(_svc.recruiter_labels(cookies_override=cookies))
```

**前端改动**：
```typescript
// BossInboxWorkbench.tsx
const [labels, setLabels] = useState<BossLabel[]>([]);

useEffect(() => {
  api.bossLabels().then(setLabels).catch(() => {
    // 降级到硬编码
    setLabels([
      { labelId: 2, name: '沟通中' },
      { labelId: 1, name: '新招呼' },
      { labelId: 0, name: '全部' },
    ]);
  });
}, []);
```

**数据流**：BOSS 账号自定义标签 → boss-cli labels → API → 前端标签下拉

**预期收益**：用户可按自定义标签（如「待跟进」「已约面」）筛选收件箱，不再局限于 3 个固定选项。

---

### Phase 2：聊天记录融入 AI 初筛

**目标**：批量导入时同步拉取聊天记录，AI 初筛时结合简历 + 聊天上下文做评估。

**改动文件**：
- `backend/app/services/boss_service.py` — 新增 `recruiter_chat(friend_id)` 方法
- `backend/app/services/boss_pipeline_service.py` — `batch_import` 中拉取聊天记录并存储；`_load_resume_text` 拼接聊天上下文
- `backend/app/api/boss.py` — 新增 `GET /boss/candidates/:id/chat` 按需查询端点
- `frontend/src/features/boss/pages/BossInboxWorkbench.tsx` — 导入后展示聊天记录
- `frontend/src/lib/api.ts` — 新增 `bossChat()` 方法

**后端实现**：

```python
# boss_service.py
def recruiter_chat(self, friend_id, cookies_override=None):
    try:
        fid = int(friend_id)
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
    return _run(["recruiter", "chat", str(fid)], timeout=30, cookies_override=cookies_override)
```

```python
# boss_pipeline_service.py — batch_import 中增加聊天拉取
# 在下载简历后，如果 friend_id 存在，拉取聊天记录
friend_id = item.get("friend_id")
chat_history = []
if friend_id:
    chat_result = self.boss.recruiter_chat(friend_id, cookies_override=cookies_override)
    if chat_result.get("ok"):
        chat_history = chat_result.get("data", [])
        if isinstance(chat_history, list):
            # 只保留最近 50 条，避免数据过大
            chat_history = chat_history[-50:]
    # 节流：与简历下载共用间隔
    if interval_sec > 0:
        time.sleep(interval_sec)

# 存入 resume_json.boss.chat_history
candidate = Candidate(
    ...
    resume_json={
        "source": "boss",
        "raw_markdown": md_text,
        "boss": {
            "geek_id": geek_id,
            "friend_id": friend_id,
            "job": ...,
            "chat_history": chat_history,  # 新增
        },
    },
    ...
)
```

```python
# boss_pipeline_service.py — _load_resume_text 增加聊天上下文
def _load_resume_text(self, candidate):
    rj = candidate.resume_json if isinstance(candidate.resume_json, dict) else {}
    text = rj.get("raw_markdown") or ""
    # 拼接聊天记录上下文
    boss_info = rj.get("boss") or {}
    chat = boss_info.get("chat_history") or []
    if chat:
        chat_text = "\n\n## 沟通记录\n"
        for msg in chat:
            role = "招聘者" if msg.get("isBoss") else "候选人"
            content = msg.get("content") or msg.get("text") or ""
            if content:
                chat_text += f"- [{role}] {content}\n"
        text += chat_text
    return text
```

**数据流**：
```
BOSS 收件箱 → boss-cli chat → 批量导入时存储 → resume_json.boss.chat_history
                                                    ↓
                                            AI 初筛 _load_resume_text()
                                                    ↓
                                            LLM 评估（简历 + 聊天上下文）
```

**预期收益**：AI 初筛能看到候选人的真实沟通表现（薪资预期、响应速度、表达能力），评估质量显著提升。

---

### Phase 3：结构化简历提取

**目标**：批量导入时额外获取结构化 JSON 简历，自动提取技能/经历标签。

**改动文件**：
- `backend/app/services/boss_pipeline_service.py` — `batch_import` 中调用 `recruiter_resume` 获取 JSON
- `backend/app/models.py` — Candidate 模型增加 `boss_structured_resume` 字段（或复用 `resume_json`）

**后端实现**：
```python
# boss_pipeline_service.py — batch_import 中增加结构化简历
structured = self.boss.recruiter_resume(
    encrypt_geek_id=geek_id,
    job=_safe_str(item.get("job") or boss_job, 64) or None,
    security_id=_safe_str(item.get("security_id"), 80) or None,
    cookies_override=cookies_override,
)
structured_resume = structured.get("data") if structured.get("ok") else None

# 存入 resume_json.boss.structured_resume
candidate = Candidate(
    ...
    resume_json={
        "source": "boss",
        "raw_markdown": md_text,
        "boss": {
            "geek_id": geek_id,
            "structured_resume": structured_resume,  # 新增
            "chat_history": chat_history,
        },
    },
    ...
)
```

**数据流**：
```
BOSS 简历 → boss-cli resume (JSON) → 批量导入时存储 → resume_json.boss.structured_resume
                                                          ↓
                                                  候选人详情页格式化展示
                                                  技能/经历自动提取为标签
```

**预期收益**：候选人详情页展示结构化的工作经历/学历/技能，而非纯 Markdown；为后续匹配系统提供结构化数据。

---

### Phase 4：候选人搜索

**目标**：新增搜索 tab，支持关键词 + 城市 + 经验 + 学历 + 薪资筛选。

**改动文件**：
- `backend/app/services/boss_service.py` — 新增 `recruiter_search()` 方法
- `backend/app/api/boss.py` — 新增 `GET /boss/candidates/search` 端点
- `frontend/src/features/boss/pages/BossPage.tsx` — 新增搜索 tab
- `frontend/src/lib/api.ts` — 新增 `bossSearchCandidates()` 方法
- `frontend/src/types/index.ts` — 新增 `BossSearchParams` 类型

**后端实现**：
```python
# boss_service.py
def recruiter_search(self, keyword, city=None, exp=None, degree=None,
                     salary=None, job=None, page=1, cookies_override=None):
    kw = _safe_text(keyword, 80)
    if not kw:
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "keyword 不能为空"}}
    try:
        page = max(1, int(page))
    except (TypeError, ValueError):
        page = 1
    args = ["recruiter", "search", kw]
    args += _opt("-c", city)
    args += _opt("--exp", exp)
    args += _opt("--degree", degree)
    args += _opt("--salary", salary)
    args += _opt("--job", job)
    args += ["-p", str(page)]
    return _run(args, timeout=45, cookies_override=cookies_override)
```

**前端改动**：
```typescript
// BossPage.tsx — 新增搜索 tab
type TabKey = 'inbox' | 'search' | 'recommend' | 'jobs';

// 搜索表单：关键词 + 城市 + 经验 + 学历 + 薪资
// 搜索结果支持「批量导入」按钮，复用 BossInboxWorkbench 的导入逻辑
```

**数据流**：
```
用户输入关键词 → boss-cli search → API → 前端搜索结果列表
                                                ↓
                                        勾选 → 批量导入 → AI 初筛
```

**预期收益**：用户可主动搜索候选人，不再被动等待收件箱消息。搜索结果可直接批量导入走闭环。

---

### Phase 5：聊天操作（发消息/请求简历/交换联系方式）

**目标**：在系统内直接回复候选人消息、请求简历、交换联系方式。

**改动文件**：
- `backend/app/services/boss_service.py` — 新增 `recruiter_reply()`、`recruiter_request_resume()`、`recruiter_exchange_phone()`、`recruiter_exchange_wechat()` 方法
- `backend/app/api/boss.py` — 新增对应 POST 端点
- `frontend/src/features/boss/pages/BossInboxWorkbench.tsx` — 聊天记录区增加操作按钮
- `frontend/src/lib/api.ts` — 新增对应 API 方法

**后端实现**：
```python
# boss_service.py
def recruiter_reply(self, friend_id, message, cookies_override=None):
    try:
        fid = int(friend_id)
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
    msg = _safe_text(message, 500)
    if not msg:
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "message 不能为空"}}
    return _run(["recruiter", "reply", str(fid), msg, "-y"], timeout=30, cookies_override=cookies_override)

def recruiter_request_resume(self, friend_id, cookies_override=None):
    try:
        fid = int(friend_id)
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
    return _run(["recruiter", "request-resume", str(fid), "-y"], timeout=30, cookies_override=cookies_override)

def recruiter_exchange_phone(self, friend_id, cookies_override=None):
    try:
        fid = int(friend_id)
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
    return _run(["recruiter", "exchange-phone", str(fid), "-y"], timeout=30, cookies_override=cookies_override)

def recruiter_exchange_wechat(self, friend_id, cookies_override=None):
    try:
        fid = int(friend_id)
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "friend_id 必须为整数"}}
    return _run(["recruiter", "exchange-wechat", str(fid), "-y"], timeout=30, cookies_override=cookies_override)
```

**前端改动**：
```
聊天记录区底部：
  [输入框] [发送消息]
  [请求简历] [交换手机] [交换微信]
```

**数据流**：
```
用户在系统内操作 → boss-cli reply/request-resume/exchange → BOSS 直聘
                                                              ↓
                                                      候选人收到消息
```

**预期收益**：招聘者无需切换到 BOSS 网页端，直接在系统内完成沟通闭环。

---

### Phase 6：候选人标记与导出

**目标**：支持标记不合适、导出候选人数据。

**改动文件**：
- `backend/app/services/boss_service.py` — 新增 `recruiter_mark_unsuitable()`、`recruiter_export()` 方法
- `backend/app/api/boss.py` — 新增对应端点
- `frontend/src/features/boss/pages/BossPage.tsx` — 推荐/收件箱增加「标记不合适」按钮

**后端实现**：
```python
# boss_service.py
def recruiter_mark_unsuitable(self, encrypt_geek_id, job=None, cookies_override=None):
    gid = _safe_text(encrypt_geek_id, 64)
    if not gid:
        return {"ok": False, "data": None, "error": {"code": "invalid_params", "message": "encrypt_geek_id 不能为空"}}
    args = ["recruiter", "mark-unsuitable", gid]
    args += _opt("--job", job)
    args += ["-y"]
    return _run(args, timeout=30, cookies_override=cookies_override)

def recruiter_export(self, format="json", cookies_override=None):
    return _run(["recruiter", "export", "--format", format], timeout=60,
                want_json=(format == "json"), cookies_override=cookies_override)
```

**预期收益**：淘汰候选人可直接标记，无需回到 BOSS 网页端；批量导出方便数据分析。

---

## 4. 实施优先级与工作量

| Phase | 功能 | 改动文件数 | 预估工时 | 价值 |
|-------|------|-----------|----------|------|
| 1 | 标签动态加载 | 5 | 1h | ⭐⭐⭐ 收件箱筛选准确性提升 |
| 2 | 聊天记录融入 AI 初筛 | 5 | 2h | ⭐⭐⭐⭐⭐ AI 筛选质量显著提升 |
| 3 | 结构化简历提取 | 2 | 1.5h | ⭐⭐⭐ 候选人详情展示优化 |
| 4 | 候选人搜索 | 5 | 2h | ⭐⭐⭐⭐ 主动 sourcing 能力 |
| 5 | 聊天操作 | 5 | 2h | ⭐⭐⭐ 沟通闭环 |
| 6 | 标记与导出 | 3 | 1h | ⭐⭐ 运营便利 |

**建议实施顺序**：Phase 1 → 2 → 4 → 3 → 5 → 6

理由：Phase 1 最小改动最大收益；Phase 2 直接提升 AI 初筛质量（核心价值）；Phase 4 补上主动搜索能力；其余按需实施。

---

## 5. 数据流全景图

```
BOSS 直聘招聘端
    │
    ├─ 收件箱 ──────────→ 批量导入 ──→ Candidate 记录
    │   ├─ 简历（Markdown）              ├─ resume_json.raw_markdown
    │   ├─ 简历（JSON 结构）[Phase 3]     ├─ resume_json.boss.structured_resume
    │   ├─ 聊天记录 [Phase 2]            ├─ resume_json.boss.chat_history
    │   └─ 标签 [Phase 1]               └─ boss_labels [Phase 1]
    │
    ├─ 推荐候选人 ───────→ 查看/下载简历
    │
    ├─ 搜索 [Phase 4] ──→ 搜索结果列表 ──→ 批量导入（同上）
    │
    ├─ 聊天操作 [Phase 5] ──→ 发消息/请求简历/交换联系方式
    │
    ├─ 标记 [Phase 6] ──→ 标记不合适
    │
    └─ 标签 [Phase 1] ──→ 动态标签列表 ──→ 收件箱筛选

Candidate 记录
    │
    ├─ AI 初筛 ──→ Interview 记录（结合简历 + 聊天上下文）
    │
    ├─ 候选人详情 ──→ 结构化展示（工作经历/学历/技能/聊天记录）
    │
    └─ 匹配系统 ──→ 技能/经历标签匹配岗位 JD
```

---

## 6. 风险与注意事项

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| 频控 | boss-cli 请求 BOSS API 有频率限制 | 批量操作保持 1.5s 间隔，命中 rate_limited 立即停止 |
| Cookie 过期 | 浏览器 Cookie 会过期，需定期重新导入 | 账号管理页显示 last_verified_at，过期时提示重新导入 |
| 聊天记录体积 | 聊天记录可能很长 | 只保留最近 50 条，存储时截断 |
| 结构化简历字段 | boss-cli 返回的 JSON 结构可能随版本变化 | 做防御性解析，缺失字段不报错 |
| 搜索 stoken 依赖 | `recruiter search` 需要 stoken（Tier-2） | 搜索功能可能因 stoken 过期返回空结果，需提示用户 |
