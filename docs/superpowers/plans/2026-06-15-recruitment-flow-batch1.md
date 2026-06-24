# HireInsight 关键功能补全 — Batch 1 (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭开放注册的提权漏洞、把招聘流程拆成多轮面试可流转、打通 AI 面试与面试官评分到流程状态的闭环。

**Architecture:** Flask app-factory + SQLAlchemy/SQLite 后端，Vite+React18+TS 前端。本批分三阶段顺序合入：A(M3 用户管理+注册安全，安全优先) → B(M1 多轮次流程) → C(M2 面试闭环+评分)。每阶段自成可验收的工作软件，结尾绿色提交。

**Tech Stack:** Python/Flask, SQLAlchemy, bcrypt, PyJWT, pytest；React, TypeScript, react-router, Tailwind。

**Spec:** `docs/superpowers/specs/2026-06-15-recruitment-flow-gap-prd.md`

---

## File Structure

**新增（后端）**
- `backend/tests/conftest.py` — pytest fixture：内存库 app + client + 角色 token 工具。
- `backend/tests/test_auth_security.py` — M3 注册/登录/停用测试。
- `backend/tests/test_admin_users.py` — M3 用户管理端点测试。
- `backend/tests/test_pipeline_rounds.py` — M1 多轮阶段 + note 测试。
- `backend/tests/test_interview_loop.py` — M2 回写流程 + 评分卡 + 列表测试。
- `backend/app/api/admin.py` — admin 用户管理蓝图。
- `backend/migrate_stages.py` — 一次性幂等迁移脚本（interview→interview_first；建新表/列）。

**修改（后端）**
- `backend/app/models.py` — `VALID_STAGES`/`STAGE_ORDER`、`PipelineStage.note`、`User.is_active`、新表 `InterviewFeedback`。
- `backend/app/api/auth.py` — register 强制 recruiter；login 校验 is_active。
- `backend/app/api/pipeline.py` — move 接受 note；STAGE_ORDER 跟随 models。
- `backend/app/api/interview.py` — submit 回写流程；新增 feedback 写/读、面试记录列表。
- `backend/app/__init__.py` — 注册 admin 蓝图。

**新增（前端）**
- `frontend/src/pages/admin/UsersPage.tsx` — M3 用户管理界面。
- `frontend/src/pages/InterviewListPage.tsx` — M2 面试记录列表。
- `frontend/src/components/interview/FeedbackForm.tsx` — M2 面试官评分卡。

**修改（前端）**
- `frontend/src/types/index.ts`、`frontend/src/lib/api.ts` — 新类型与端点。
- `frontend/src/lib/pipelineStages.ts` — 扩充阶段条目（一面/二面/终面）。
- `frontend/src/components/pipeline/CandidateCard.tsx` — FORWARD 映射 + 备注输入。
- `frontend/src/lib/nav.ts`、`frontend/src/App.tsx` — 路由：`/interviews`(列表)、`/interviews/new`(发起)、`/admin/users`。
- `frontend/src/pages/InterviewsPage.tsx` — 迁为 `/interviews/new`。

---

## Phase A — M3 用户管理 + 注册安全（安全优先）

### Task A0: pytest API fixture

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Write the fixture file**

```python
# backend/tests/conftest.py
import sys
from pathlib import Path

# 让 `import app` 生效（backend/ 入 sys.path）
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from app import create_app, db as _db
from app.config import TestingConfig


@pytest.fixture()
def app():
    app = create_app(TestingConfig)
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def make_user(app):
    """直接建用户并返回 (user_id, token)。绕过 register，便于建任意角色做测试前置。"""
    import bcrypt, jwt
    from datetime import datetime, timedelta
    from app.models import User
    from app.config import TestingConfig

    def _make(email, role="recruiter", password="pw123456", name="T", is_active=True):
        with app.app_context():
            u = User(name=name, email=email, role=role, is_active=is_active,
                     password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode())
            db_ = __import__("app", fromlist=["db"]).db
            db_.session.add(u); db_.session.commit()
            uid = u.id
        token = jwt.encode({"user_id": uid, "role": role,
                            "exp": datetime.utcnow() + timedelta(hours=1)},
                           TestingConfig.JWT_SECRET, algorithm="HS256")
        return uid, token
    return _make
```

- [ ] **Step 2: Verify collection works (no tests yet)**

Run: `cd backend && python -m pytest tests/conftest.py -q`
Expected: `no tests ran` (collection succeeds, exit 0/5 — no import error).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "test: add pytest api fixture (app/client/make_user)"
```

> 注意：`make_user` 依赖 `User.is_active`，该列在 Task A1 加入。A0 的 commit 仅放 fixture，A1 完成后 fixture 才可被用例真正调用——这是有意的顺序（先有库结构变更，再跑用例）。

---

### Task A1: User.is_active 字段

**Files:**
- Modify: `backend/app/models.py:5-12` (User 类)

- [ ] **Step 1: Add the column**

在 `User` 类 `created_at` 行后新增：

```python
    is_active = db.Column(db.Boolean, default=True, nullable=False)
```

- [ ] **Step 2: Verify model imports**

Run: `cd backend && python -c "from app.models import User; print('is_active' in User.__table__.columns)"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(model): add User.is_active for account deactivation"
```

> **种子库注意**：SQLite `create_all()` 不会给已存在的 `users` 表补 `is_active` 列。Phase A 的 pytest 用内存库（`TestingConfig`，每次 `create_all` 新建），不受影响、可直接全绿。但若在 A1 之后、B3 之前用 `python run.py` 启动**真实种子库** `hireinsight.db`，登录会因缺列报错。B3 Step 2 会用 `ALTER TABLE` 给种子库补 `is_active`/`note`。因此：开发期跑真实库前先执行 B3 Step 2，或直接按 A→B→C 顺序推进（B3 会补齐）。

---

### Task A2: 注册强制 recruiter + 登录校验 is_active

**Files:**
- Modify: `backend/app/api/auth.py:24-51`
- Test: `backend/tests/test_auth_security.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_auth_security.py
def test_register_ignores_role_forces_recruiter(client):
    r = client.post("/api/auth/register", json={
        "name": "Mallory", "email": "m@x.com", "password": "pw123456", "role": "admin"})
    assert r.status_code == 201
    assert r.get_json()["role"] == "recruiter"  # 自封 admin 被拒绝，落库为 recruiter

def test_deactivated_user_cannot_login(client, make_user, app):
    make_user("dead@x.com", role="recruiter", password="pw123456", is_active=False)
    r = client.post("/api/auth/login", json={"email": "dead@x.com", "password": "pw123456"})
    assert r.status_code == 403

def test_active_user_can_login(client, make_user):
    make_user("ok@x.com", role="manager", password="pw123456")
    r = client.post("/api/auth/login", json={"email": "ok@x.com", "password": "pw123456"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && python -m pytest tests/test_auth_security.py -q`
Expected: FAIL — `test_register_ignores_role_forces_recruiter`（现返回 admin）与 `test_deactivated_user_cannot_login`（现返回 401，且无 is_active 校验）。

- [ ] **Step 3: Fix register — force recruiter**

`auth.py` register 内，把 `role=data.get("role", "recruiter")` 改为固定：

```python
    user = User(
        name=data.get("name", ""),
        email=data["email"],
        role="recruiter",  # 安全：注册一律为 recruiter，特权角色由 admin 分配
        password_hash=_hash(data["password"]),
    )
```

- [ ] **Step 4: Fix login — reject inactive**

`auth.py` login 内，在凭证校验通过后、生成 token 前插入：

```python
    if not user.is_active:
        return jsonify({"error": "账号已停用，请联系管理员"}), 403
```

- [ ] **Step 5: Run, expect pass**

Run: `cd backend && python -m pytest tests/test_auth_security.py -q`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/auth.py backend/tests/test_auth_security.py
git commit -m "fix(auth): force recruiter on register, block inactive login (G6)"
```

---

### Task A3: admin 用户管理端点

**Files:**
- Create: `backend/app/api/admin.py`
- Modify: `backend/app/__init__.py:27-29` (注册蓝图)
- Test: `backend/tests/test_admin_users.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_admin_users.py
def _auth(token):
    return {"Authorization": f"Bearer {token}"}

def test_list_users_admin_only(client, make_user):
    _, rec_token = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(rec_token))
    assert r.status_code == 403  # 非 admin 禁止

def test_admin_lists_and_updates_role(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.get("/api/admin/users", headers=_auth(admin_token))
    assert r.status_code == 200
    assert "r@x.com" in [u["email"] for u in r.get_json()]
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "manager"})
    assert r.status_code == 200
    assert r.get_json()["role"] == "manager"

def test_admin_deactivates_user(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"is_active": False})
    assert r.status_code == 200
    assert r.get_json()["is_active"] is False

def test_invalid_role_rejected(client, make_user):
    _, admin_token = make_user("a@x.com", role="admin")
    target_id, _ = make_user("r@x.com", role="recruiter")
    r = client.patch(f"/api/admin/users/{target_id}", headers=_auth(admin_token),
                     json={"role": "superuser"})
    assert r.status_code == 400
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && python -m pytest tests/test_admin_users.py -q`
Expected: FAIL — 404 (蓝图未注册)。

- [ ] **Step 3: Create admin blueprint**

```python
# backend/app/api/admin.py
from flask import Blueprint, request, jsonify
from ..middleware.auth import require_auth, require_role
from ..middleware.events import record_event
from .. import db
from ..models import User

bp = Blueprint("admin", __name__)
VALID_ROLES = {"recruiter", "interviewer", "manager", "admin"}


@bp.get("/admin/users")
@require_auth
@require_role("admin")
def list_users():
    users = User.query.order_by(User.id.asc()).all()
    return jsonify([{
        "id": u.id, "name": u.name, "email": u.email, "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users])


@bp.patch("/admin/users/<int:user_id>")
@require_auth
@require_role("admin")
def update_user(user_id):
    data = request.get_json() or {}
    user = User.query.get(user_id)
    if user is None:
        return jsonify({"error": "用户不存在"}), 404
    if "role" in data:
        if data["role"] not in VALID_ROLES:
            return jsonify({"error": f"无效角色。可选：{sorted(VALID_ROLES)}"}), 400
        user.role = data["role"]
        record_event("user.role_changed", entity_id=user_id, entity_type="user",
                     payload={"role": data["role"]})
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
        record_event("user.active_changed", entity_id=user_id, entity_type="user",
                     payload={"is_active": user.is_active})
    db.session.commit()
    return jsonify({"id": user.id, "name": user.name, "email": user.email,
                    "role": user.role, "is_active": user.is_active})
```

- [ ] **Step 4: Register blueprint**

`backend/app/__init__.py` 第 27-29 行，导入与注册加入 `admin`：

```python
    from .api import resume, jobs, candidates, match, interview, pipeline, bi, auth, agent, admin
    for bp in [auth.bp, resume.bp, jobs.bp, candidates.bp, match.bp, interview.bp, pipeline.bp, bi.bp, agent.bp, admin.bp]:
        app.register_blueprint(bp, url_prefix="/api")
```

- [ ] **Step 5: Run, expect pass**

Run: `cd backend && python -m pytest tests/test_admin_users.py -q`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/admin.py backend/app/__init__.py backend/tests/test_admin_users.py
git commit -m "feat(admin): user management endpoints — list/role/deactivate (G7)"
```

---

### Task A4: 前端用户管理页 + 路由

**Files:**
- Modify: `frontend/src/types/index.ts` (末尾追加 AdminUser)
- Modify: `frontend/src/lib/api.ts` (admin 端点 + 导入 AdminUser)
- Create: `frontend/src/pages/admin/UsersPage.tsx`
- Modify: `frontend/src/lib/nav.ts` (admin 导航项 + import ShieldCheck)
- Modify: `frontend/src/App.tsx` (import + 路由)

- [ ] **Step 1: Add type** — `frontend/src/types/index.ts` 末尾：

```typescript
// ---- Admin user management ----
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string | null;
}
```

- [ ] **Step 2: Add API methods** — `frontend/src/lib/api.ts`：顶部类型导入块加入 `AdminUser`，并在 `api` 对象 Account 段后追加：

```typescript
  // ---- Admin (admin-only) ----
  listUsers(): Promise<AdminUser[]> {
    return request('/admin/users');
  },
  updateUser(
    userId: number,
    payload: { role?: Role; is_active?: boolean },
  ): Promise<AdminUser> {
    return request(`/admin/users/${userId}`, { method: 'PATCH', body: payload });
  },
```

> 注意：`Role` 类型已在 `types` 导出；若 api.ts 尚未导入 `Role`，在类型导入块补 `Role`。

- [ ] **Step 3: Create UsersPage**

```tsx
// frontend/src/pages/admin/UsersPage.tsx
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate } from '../../lib/formatDate';
import {
  Card, CardHeader, CardTitle, Spinner, ErrorState, PageHeader, Select, Badge,
} from '../../components/ui';
import type { Role } from '../../types';

const ROLES: Role[] = ['recruiter', 'interviewer', 'manager', 'admin'];
const ROLE_LABEL: Record<Role, string> = {
  recruiter: '招聘专员', interviewer: '面试官', manager: '经理', admin: '管理员',
};

export function UsersPage() {
  const { data, loading, error, reload } = useAsync(() => api.listUsers(), []);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function changeRole(id: number, role: Role) {
    setBusyId(id);
    try { await api.updateUser(id, { role }); await reload(); }
    finally { setBusyId(null); }
  }
  async function toggleActive(id: number, isActive: boolean) {
    setBusyId(id);
    try { await api.updateUser(id, { is_active: isActive }); await reload(); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="用户管理" description="管理团队成员的角色与账号状态" />
      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && (
        <Card>
          <CardHeader><CardTitle>成员列表</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">姓名</th>
                  <th className="px-5 py-3">邮箱</th>
                  <th className="px-5 py-3">角色</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{u.name || '—'}</td>
                    <td className="px-5 py-3 text-muted">{u.email}</td>
                    <td className="px-5 py-3">
                      <Select
                        aria-label={`角色-${u.id}`}
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-5 py-3">
                      {u.is_active
                        ? <Badge tone="success">启用</Badge>
                        : <Badge tone="danger">停用</Badge>}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {u.created_at ? formatDate(u.created_at) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        disabled={busyId === u.id}
                        onClick={() => toggleActive(u.id, !u.is_active)}
                        className="text-xs font-medium text-muted hover:text-ink disabled:opacity-50"
                      >
                        {u.is_active ? '停用' : '启用'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add nav item** — `frontend/src/lib/nav.ts`：顶部 lucide import 补 `ShieldCheck`，`NAV_ITEMS` 内 `/bi` 项后追加：

```typescript
  {
    to: '/admin/users',
    label: '用户管理',
    icon: ShieldCheck,
    roles: ['admin'],
  },
```

- [ ] **Step 5: Add route** — `frontend/src/App.tsx`：

```tsx
import { UsersPage } from './pages/admin/UsersPage';
```

```tsx
        <Route
          path="/admin/users"
          element={<RequireRole allow={['admin']} element={<UsersPage />} />}
        />
```

- [ ] **Step 6: Type-check**

Run (PowerShell): `cd C:\Users\Administrator\Desktop\hl\frontend; npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/UsersPage.tsx frontend/src/lib/nav.ts frontend/src/lib/api.ts frontend/src/types/index.ts frontend/src/App.tsx
git commit -m "feat(admin): user management UI at /admin/users (G7)"
```

> **Phase A 验收**：`cd backend && python -m pytest tests/test_auth_security.py tests/test_admin_users.py -q` 全绿；前端 tsc 通过。注册不可自封 admin、停用账号不能登录、admin 能改角色。

---

## Phase B — M1 多轮次招聘流程流转

### Task B1: 阶段枚举扩充 + note 字段

**Files:**
- Modify: `backend/app/models.py:70` (VALID_STAGES) + `PipelineStage` 类
- Modify: `backend/app/api/pipeline.py:11` (STAGE_ORDER)

- [ ] **Step 1: Update VALID_STAGES** — `backend/app/models.py`：

```python
VALID_STAGES = {
    "pending", "ai_screen",
    "interview_first", "interview_second", "interview_final",
    "offer", "onboarded", "rejected",
}
```

- [ ] **Step 2: Add note column** — `PipelineStage` 类 `ts` 行前加：

```python
    note = db.Column(db.Text)  # 本次阶段变更原因/备注，可空
```

- [ ] **Step 3: Update STAGE_ORDER** — `backend/app/api/pipeline.py` 顶部：

```python
STAGE_ORDER = ["pending", "ai_screen", "interview_first",
               "interview_second", "interview_final", "offer", "onboarded"]
```

- [ ] **Step 4: Accept note in move** — `pipeline.py` `move_stage()` 内，读取 `note` 并写入。把 `data.get("stage")` 后面加 `note = data.get("note")`，并在构造 `PipelineStage(...)` 时加 `note=note`。事件 payload 也带上 note：

```python
    note = data.get("note")
    # ... 构造时：
    ps = PipelineStage(candidate_id=candidate_id, job_id=job_id,
                       stage=to_stage, updated_by=g.user_id, note=note)
    # ... record_event payload 加 "note": note
```

- [ ] **Step 5: Surface note in board + history** — `get_board()` 候选人字典与 `get_history()` 时间线条目各加 `"note": ps.note`。

- [ ] **Step 6: Verify import**

Run: `cd backend && python -c "from app.models import VALID_STAGES; print(sorted(VALID_STAGES))"`
Expected: `['ai_screen', 'interview_final', 'interview_first', 'interview_second', 'offer', 'onboarded', 'pending', 'rejected']`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/api/pipeline.py
git commit -m "feat(pipeline): expand stages to multi-round + add move note (G1,G2)"
```

---

### Task B2: 后端多轮流转测试

**Files:**
- Test: `backend/tests/test_pipeline_rounds.py`

- [ ] **Step 1: Write tests** — 用 fixture 建岗位/候选人后走 move：

```python
# backend/tests/test_pipeline_rounds.py
def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed_job_candidate(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_move_through_rounds_with_note(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    for stage in ["pending", "ai_screen", "interview_first", "interview_second"]:
        r = client.post("/api/pipeline/move", headers=_auth(token),
                        json={"candidate_id": cid, "job_id": jid, "stage": stage,
                              "note": f"进入{stage}"})
        assert r.status_code == 200
    # 当前阶段计数应只在 interview_second
    counts = client.get(f"/api/pipeline/{jid}", headers=_auth(token)).get_json()
    assert counts == {"interview_second": 1}
    # history 含 note 与顺序
    hist = client.get(f"/api/pipeline/{jid}/history/{cid}", headers=_auth(token)).get_json()
    stages = [t["stage"] for t in hist["timeline"]]
    assert stages == ["pending", "ai_screen", "interview_first", "interview_second"]
    assert hist["timeline"][-1]["note"] == "进入interview_second"

def test_invalid_stage_rejected(client, make_user, app):
    _, token = make_user("hr@x.com", role="recruiter")
    jid, cid = _seed_job_candidate(app)
    r = client.post("/api/pipeline/move", headers=_auth(token),
                    json={"candidate_id": cid, "job_id": jid, "stage": "interview"})
    assert r.status_code == 400  # 旧的单值 interview 不再合法
```

- [ ] **Step 2: Run, expect pass**

Run: `cd backend && python -m pytest tests/test_pipeline_rounds.py -q`
Expected: 2 passed. (若 board/history 未加 note 字段会在第一个用例失败 → 回到 B1 Step5 补。)

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_pipeline_rounds.py
git commit -m "test(pipeline): multi-round transitions + note timeline"
```

---

### Task B3: 数据迁移脚本（interview → interview_first）

**Files:**
- Create: `backend/migrate_stages.py`

- [ ] **Step 1: Write idempotent migration**

```python
# backend/migrate_stages.py
"""一次性幂等迁移：旧单值 interview → interview_first；建新表/新列。
重跑安全：无 interview 行则 0 改动。"""
from app import create_app, db
from app.models import PipelineStage

def run():
    app = create_app()
    with app.app_context():
        db.create_all()  # 建 InterviewFeedback 表 / 补新列（SQLite 对已存在表不重建）
        rows = PipelineStage.query.filter_by(stage="interview").all()
        for r in rows:
            r.stage = "interview_first"
        db.session.commit()
        print(f"migrated {len(rows)} 'interview' rows -> 'interview_first'")

if __name__ == "__main__":
    run()
```

> SQLite 不会用 `create_all()` 给已存在表加列。`PipelineStage.note`、`User.is_active` 这类新列在开发用种子库需手动加：见 Step 2。新表（InterviewFeedback）`create_all()` 可直接建。

- [ ] **Step 2: Add columns to seed DB (one-off)**

Run (PowerShell, 给种子库补列；幂等性靠 try/except)：

```bash
cd C:\Users\Administrator\Desktop\hl\backend
python -c "import sqlite3; c=sqlite3.connect('hireinsight.db'); [c.execute(s) for s in ['ALTER TABLE pipeline_stages ADD COLUMN note TEXT','ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1'] if True]; c.commit()" 2>&1 || echo "columns may already exist"
```

(若列已存在会报 duplicate column，可忽略；或先查 PRAGMA table_info。)

- [ ] **Step 3: Run migration**

Run: `cd backend && python migrate_stages.py`
Expected: `migrated N 'interview' rows -> 'interview_first'`（种子库当前有 interview 行，N>0；再跑一次 N=0）。

- [ ] **Step 4: Commit**

```bash
git add backend/migrate_stages.py backend/hireinsight.db
git commit -m "chore(migrate): interview->interview_first, add note/is_active/feedback (G1)"
```

---

### Task B4: 前端阶段配置 + 看板备注

**Files:**
- Modify: `frontend/src/types/index.ts` (PipelineStage 联合类型)
- Modify: `frontend/src/lib/pipelineStages.ts` (STAGES 扩充)
- Modify: `frontend/src/components/pipeline/CandidateCard.tsx` (FORWARD + 备注输入)
- Modify: `frontend/src/types/index.ts` (PipelineMoveRequest 加 note；board/history 条目加 note)

- [ ] **Step 1: Extend PipelineStage type** — `types/index.ts`：

```typescript
export type PipelineStage =
  | 'pending'
  | 'ai_screen'
  | 'interview_first'
  | 'interview_second'
  | 'interview_final'
  | 'offer'
  | 'onboarded'
  | 'rejected';
```

- [ ] **Step 2: Add note fields** — `types/index.ts`：`PipelineMoveRequest` 加 `note?: string`；`PipelineBoardCandidate` 与 `PipelineHistoryStep` 各加 `note?: string | null`。

- [ ] **Step 3: Extend STAGES** — `lib/pipelineStages.ts`：把原 `interview` 条目替换为三条（一面/二面/终面），置于 `ai_screen` 与 `offer` 之间。复用既有配色键，三轮用渐深的 warning 色：

```typescript
  {
    key: 'interview_first', label: '一面',
    bg: 'bg-warning-50', border: 'border-warning-200',
    text: 'text-warning-700', badgeBg: 'bg-warning-100 text-warning-700', dot: 'bg-warning-500',
  },
  {
    key: 'interview_second', label: '二面',
    bg: 'bg-warning-50', border: 'border-warning-200',
    text: 'text-warning-700', badgeBg: 'bg-warning-100 text-warning-700', dot: 'bg-warning-500',
  },
  {
    key: 'interview_final', label: '终面',
    bg: 'bg-warning-50', border: 'border-warning-300',
    text: 'text-warning-800', badgeBg: 'bg-warning-200 text-warning-800', dot: 'bg-warning-600',
  },
```

- [ ] **Step 4: Update FORWARD map** — `CandidateCard.tsx`：

```typescript
const FORWARD: Partial<Record<PipelineStage, PipelineStage>> = {
  pending: 'ai_screen',
  ai_screen: 'interview_first',
  interview_first: 'interview_second',
  interview_second: 'interview_final',
  interview_final: 'offer',
  offer: 'onboarded',
};
```

并把 `isTerminal` 判断保持 `onboarded`/`rejected`。

- [ ] **Step 5: Optional note prompt on move** — `CandidateCard.tsx` 的 `onMove` 调用点改为先 `window.prompt('变更备注（可留空）')`，把结果作为第三参传出；`onMove` 签名扩展为 `(candidateId, toStage, note?)`。对应 `PipelinePage.handleMove` 把 note 透传给 `api.movePipeline`。

> 取舍：用原生 `window.prompt` 是本期最小实现，避免新建弹窗组件。后续可替换为 Modal。

- [ ] **Step 6: Type-check**

Run (PowerShell): `cd C:\Users\Administrator\Desktop\hl\frontend; npx tsc --noEmit`
Expected: exit 0。注意横向列变多，看板 grid 已是 `xl:grid-cols-6`，列不足会自动换行/滚动，无需额外改。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/pipelineStages.ts frontend/src/components/pipeline/CandidateCard.tsx frontend/src/pages/PipelinePage.tsx
git commit -m "feat(pipeline): multi-round stages + move note in board UI (G1,G2)"
```

> **Phase B 验收**：看板出现 一面/二面/终面 三列；推进并填备注后时间线含备注；旧 interview 数据迁移后显示为"一面"；后端 round 测试全绿。

---

## Phase C — M2 面试闭环 + 面试官评分

### Task C1: InterviewFeedback 模型 + AI 面试回写流程

**Files:**
- Modify: `backend/app/models.py` (新表 InterviewFeedback)
- Modify: `backend/app/api/interview.py` (submit 回写 + feedback 端点 + 列表)

- [ ] **Step 1: Add InterviewFeedback model** — `backend/app/models.py` 末尾：

```python
class InterviewFeedback(db.Model):
    __tablename__ = "interview_feedback"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    job_id = db.Column(db.Integer, db.ForeignKey("jobs.id"), nullable=False)
    round = db.Column(db.String(30), nullable=False)  # interview_first/second/final
    interviewer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Integer)        # 1-5
    passed = db.Column(db.Boolean)
    strengths = db.Column(db.Text)
    concerns = db.Column(db.Text)
    note = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: AI submit writes pipeline** — `interview.py` `submit_interview()`，在 `record_event("interview.scored", ...)` 后、return 前插入回写逻辑：

```python
    # R2.1 回写流程：通过→一面；不通过→淘汰。未入流程先补 ai_screen 再推进。
    from ..models import PipelineStage, VALID_STAGES
    last = (PipelineStage.query
            .filter_by(candidate_id=candidate_id, job_id=job_id)
            .order_by(PipelineStage.id.desc()).first())
    passed = report["pass_recommended"]
    if last is None:
        db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                     stage="ai_screen", updated_by=g.user_id,
                                     note="AI 预筛入流程"))
    target = "interview_first" if passed else "rejected"
    note = f"AI 预筛{'通过' if passed else '未通过'}，均分 {report['avg_score']}"
    db.session.add(PipelineStage(candidate_id=candidate_id, job_id=job_id,
                                 stage=target, updated_by=g.user_id, note=note))
    db.session.commit()
```

- [ ] **Step 3: Verify import**

Run: `cd backend && python -c "from app.models import InterviewFeedback; print(InterviewFeedback.__tablename__)"`
Expected: `interview_feedback`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py backend/app/api/interview.py
git commit -m "feat(interview): scorecard model + AI result writes pipeline stage (G3,G4)"
```

---

### Task C2: 面试官评分 + 面试记录列表端点

**Files:**
- Modify: `backend/app/api/interview.py` (feedback 写/读 + /interviews 列表)
- Test: `backend/tests/test_interview_loop.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_interview_loop.py
def _auth(t): return {"Authorization": f"Bearer {t}"}

def _seed(app):
    with app.app_context():
        from app import db
        from app.models import Job, Candidate
        j = Job(title="后端", jd_text="x"); c = Candidate(name_masked="候选人A", resume_json={})
        db.session.add_all([j, c]); db.session.commit()
        return j.id, c.id

def test_interviewer_submits_feedback(client, make_user, app):
    _, token = make_user("iv@x.com", role="interviewer")
    jid, cid = _seed(app)
    r = client.post("/api/interview/feedback", headers=_auth(token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 4, "passed": True, "strengths": "扎实", "concerns": "", "note": ""})
    assert r.status_code == 201
    # 读回
    r2 = client.get(f"/api/interview/feedback?candidate_id={cid}&job_id={jid}",
                    headers=_auth(token))
    assert r2.status_code == 200
    items = r2.get_json()
    assert len(items) == 1 and items[0]["score"] == 4

def test_interviews_list_filtered_by_role(client, make_user, app):
    # manager 看全部；列表至少含刚提交的反馈
    _, iv_token = make_user("iv@x.com", role="interviewer")
    _, mgr_token = make_user("m@x.com", role="manager")
    jid, cid = _seed(app)
    client.post("/api/interview/feedback", headers=_auth(iv_token), json={
        "candidate_id": cid, "job_id": jid, "round": "interview_first",
        "score": 5, "passed": True})
    r = client.get("/api/interviews", headers=_auth(mgr_token))
    assert r.status_code == 200
    assert any(it["type"] == "feedback" for it in r.get_json())
```

- [ ] **Step 2: Run, expect fail**

Run: `cd backend && python -m pytest tests/test_interview_loop.py -q`
Expected: FAIL — 404 (端点不存在)。

- [ ] **Step 3: Add feedback + list endpoints** — `interview.py` 末尾：

```python
@bp.post("/interview/feedback")
@require_auth
def submit_feedback():
    from ..models import InterviewFeedback
    data = request.get_json() or {}
    required = ("candidate_id", "job_id", "round")
    if not all(data.get(k) for k in required):
        return jsonify({"error": "candidate_id, job_id, round required"}), 400
    fb = InterviewFeedback(
        candidate_id=data["candidate_id"], job_id=data["job_id"],
        round=data["round"], interviewer_id=g.user_id,
        score=data.get("score"), passed=data.get("passed"),
        strengths=data.get("strengths"), concerns=data.get("concerns"),
        note=data.get("note"))
    db.session.add(fb)
    db.session.commit()
    record_event("interview.feedback", entity_id=data["candidate_id"],
                 entity_type="candidate",
                 payload={"job_id": data["job_id"], "round": data["round"],
                          "score": data.get("score"), "passed": data.get("passed")})
    return jsonify({"id": fb.id, "status": "ok"}), 201


@bp.get("/interview/feedback")
@require_auth
def list_feedback():
    from ..models import InterviewFeedback, User
    cid = request.args.get("candidate_id", type=int)
    jid = request.args.get("job_id", type=int)
    q = InterviewFeedback.query
    if cid: q = q.filter_by(candidate_id=cid)
    if jid: q = q.filter_by(job_id=jid)
    rows = q.order_by(InterviewFeedback.id.desc()).all()
    return jsonify([{
        "id": f.id, "candidate_id": f.candidate_id, "job_id": f.job_id,
        "round": f.round, "interviewer_id": f.interviewer_id,
        "interviewer_name": (User.query.get(f.interviewer_id).name
                             if User.query.get(f.interviewer_id) else None),
        "score": f.score, "passed": f.passed,
        "strengths": f.strengths, "concerns": f.concerns, "note": f.note,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    } for f in rows])


@bp.get("/interviews")
@require_auth
def list_interviews():
    """面试记录列表：AI 面试 + 面试官反馈，按角色过滤。"""
    from ..models import Interview, InterviewFeedback, Candidate, Job, User
    items = []
    ai_q = Interview.query
    fb_q = InterviewFeedback.query
    # recruiter 只看自己候选人；interviewer 看自己反馈；manager/admin 全部
    if g.role == "recruiter":
        own_ids = [c.id for c in Candidate.query.filter_by(owner_hr_id=g.user_id).all()]
        ai_q = ai_q.filter(Interview.candidate_id.in_(own_ids or [-1]))
        fb_q = fb_q.filter(InterviewFeedback.candidate_id.in_(own_ids or [-1]))
    elif g.role == "interviewer":
        ai_q = ai_q.filter(Interview.id < 0)  # 面试官不看 AI 预筛发起记录（永假条件）
        fb_q = fb_q.filter_by(interviewer_id=g.user_id)

    def cname(cid):
        c = Candidate.query.get(cid); return c.name_masked if c else None
    def jtitle(jid):
        j = Job.query.get(jid); return j.title if j else None

    for iv in ai_q.order_by(Interview.id.desc()).all():
        items.append({"id": iv.id, "type": "ai", "candidate_id": iv.candidate_id,
                      "name_masked": cname(iv.candidate_id), "job_id": iv.job_id,
                      "job_title": jtitle(iv.job_id), "score": iv.score,
                      "pass": iv.pass_recommended, "round": None,
                      "created_at": iv.created_at.isoformat() if iv.created_at else None})
    for f in fb_q.order_by(InterviewFeedback.id.desc()).all():
        items.append({"id": f.id, "type": "feedback", "candidate_id": f.candidate_id,
                      "name_masked": cname(f.candidate_id), "job_id": f.job_id,
                      "job_title": jtitle(f.job_id), "score": f.score,
                      "pass": f.passed, "round": f.round,
                      "created_at": f.created_at.isoformat() if f.created_at else None})
    return jsonify(items)
```

- [ ] **Step 4: Run, expect pass**

Run: `cd backend && python -m pytest tests/test_interview_loop.py -q`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/interview.py backend/tests/test_interview_loop.py
git commit -m "feat(interview): interviewer feedback + records list endpoints (G4,G5)"
```

---

### Task C3: 前端 — 面试记录列表 + 评分卡 + 路由拆分

**Files:**
- Modify: `frontend/src/types/index.ts` (InterviewListItem, InterviewFeedback 类型)
- Modify: `frontend/src/lib/api.ts` (listInterviews / submitFeedback / listFeedback)
- Create: `frontend/src/pages/InterviewListPage.tsx`
- Create: `frontend/src/components/interview/FeedbackForm.tsx`
- Modify: `frontend/src/lib/nav.ts` (AI 面试 → 列表；interviewer 可见)
- Modify: `frontend/src/App.tsx` (路由 /interviews=列表, /interviews/new=发起)

- [ ] **Step 1: Add types** — `types/index.ts`：

```typescript
export interface InterviewListItem {
  id: number;
  type: 'ai' | 'feedback';
  candidate_id: number;
  name_masked: string | null;
  job_id: number;
  job_title: string | null;
  score: number | null;
  pass: boolean | null;
  round: string | null;
  created_at: string | null;
}

export interface InterviewFeedbackInput {
  candidate_id: number;
  job_id: number;
  round: PipelineStage;
  score: number;
  passed: boolean;
  strengths?: string;
  concerns?: string;
  note?: string;
}
```

- [ ] **Step 2: Add API methods** — `lib/api.ts`：

```typescript
  listInterviews(): Promise<InterviewListItem[]> {
    return request('/interviews');
  },
  submitFeedback(payload: InterviewFeedbackInput): Promise<{ id: number; status: string }> {
    return request('/interview/feedback', { method: 'POST', body: payload });
  },
```

(顶部类型导入加 `InterviewListItem`, `InterviewFeedbackInput`。)

- [ ] **Step 3: Create InterviewListPage**

```tsx
// frontend/src/pages/InterviewListPage.tsx
import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate } from '../lib/formatDate';
import {
  Button, Card, CardHeader, CardTitle, Spinner, EmptyState, ErrorState, PageHeader, Badge,
} from '../components/ui';

const ROUND_LABEL: Record<string, string> = {
  interview_first: '一面', interview_second: '二面', interview_final: '终面',
};

export function InterviewListPage() {
  const { data, loading, error, reload } = useAsync(() => api.listInterviews(), []);
  const items = data ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="面试记录"
        description="历史 AI 预筛与面试官评分"
        actions={<Link to="/interviews/new"><Button>发起 AI 面试</Button></Link>}
      />
      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}
      {!loading && error && <ErrorState message={error.message} onRetry={reload} />}
      {!loading && !error && items.length === 0 && (
        <Card><EmptyState icon={Bot} title="暂无面试记录"
          description="发起一次 AI 面试或录入面试官评分后，记录会出现在这里" /></Card>
      )}
      {!loading && !error && items.length > 0 && (
        <Card>
          <CardHeader><CardTitle>记录列表</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">类型</th>
                  <th className="px-5 py-3">候选人</th>
                  <th className="px-5 py-3">岗位</th>
                  <th className="px-5 py-3">评分</th>
                  <th className="px-5 py-3">结果</th>
                  <th className="px-5 py-3">时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={`${it.type}-${it.id}`} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-3">
                      {it.type === 'ai'
                        ? <Badge tone="brand">AI 预筛</Badge>
                        : <Badge tone="warning">{it.round ? ROUND_LABEL[it.round] ?? '面试' : '面试'}评分</Badge>}
                    </td>
                    <td className="px-5 py-3 text-ink">{it.name_masked ?? `#${it.candidate_id}`}</td>
                    <td className="px-5 py-3 text-muted">{it.job_title ?? `#${it.job_id}`}</td>
                    <td className="px-5 py-3 tabular-nums">{it.score ?? '—'}</td>
                    <td className="px-5 py-3">
                      {it.pass === null ? '—' : it.pass
                        ? <span className="text-success-600">通过</span>
                        : <span className="text-danger-600">不通过</span>}
                    </td>
                    <td className="px-5 py-3 text-muted">{it.created_at ? formatDate(it.created_at) : '—'}</td>
                    <td className="px-5 py-3 text-right">
                      {it.type === 'ai'
                        ? <Link to={`/interviews/${it.id}`} className="text-xs font-medium text-ink hover:underline">查看报告</Link>
                        : <span className="text-xs text-muted-soft">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create FeedbackForm** (面试官评分卡，供看板/旅程页嵌入)

```tsx
// frontend/src/components/interview/FeedbackForm.tsx
import { useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from '../ui';
import type { PipelineStage } from '../../types';

const ROUNDS: { key: PipelineStage; label: string }[] = [
  { key: 'interview_first', label: '一面' },
  { key: 'interview_second', label: '二面' },
  { key: 'interview_final', label: '终面' },
];

export function FeedbackForm({
  candidateId, jobId, onSubmitted,
}: { candidateId: number; jobId: number; onSubmitted?: () => void }) {
  const [round, setRound] = useState<PipelineStage>('interview_first');
  const [score, setScore] = useState(3);
  const [passed, setPassed] = useState(true);
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      await api.submitFeedback({ candidate_id: candidateId, job_id: jobId,
        round, score, passed, strengths, concerns });
      setMsg('已提交评分'); onSubmitted?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '提交失败');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="grid grid-cols-2 gap-3">
        <Select label="轮次" value={round} onChange={(e) => setRound(e.target.value as PipelineStage)}>
          {ROUNDS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </Select>
        <Select label="评分(1-5)" value={String(score)} onChange={(e) => setScore(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <Select label="是否通过" value={passed ? 'y' : 'n'} onChange={(e) => setPassed(e.target.value === 'y')}>
        <option value="y">通过</option>
        <option value="n">不通过</option>
      </Select>
      <textarea className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2} placeholder="优势" value={strengths} onChange={(e) => setStrengths(e.target.value)} />
      <textarea className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm"
        rows={2} placeholder="顾虑" value={concerns} onChange={(e) => setConcerns(e.target.value)} />
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <Button onClick={submit} loading={busy} disabled={busy} size="sm">提交评分</Button>
    </div>
  );
}
```

- [ ] **Step 5: Route split** — `App.tsx`：import `InterviewListPage`；把 `/interviews` 指向列表，新增 `/interviews/new` 指向既有 `InterviewsPage`（发起页），interviewer 也可见列表：

```tsx
import { InterviewListPage } from './pages/InterviewListPage';
```

```tsx
        <Route path="/interviews"
          element={<RequireRole allow={['recruiter','interviewer','manager','admin']} element={<InterviewListPage />} />} />
        <Route path="/interviews/new"
          element={<RequireRole allow={['recruiter','manager','admin']} element={<InterviewsPage />} />} />
```

- [ ] **Step 6: Nav** — `lib/nav.ts`：`/interviews` 项 roles 改为 `['recruiter','interviewer','manager','admin']`（列表对面试官也开放）。label 保持「AI 面试」或改「面试记录」（择一，建议「面试记录」）。

- [ ] **Step 7: Type-check**

Run (PowerShell): `cd C:\Users\Administrator\Desktop\hl\frontend; npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/InterviewListPage.tsx frontend/src/components/interview/FeedbackForm.tsx frontend/src/types/index.ts frontend/src/lib/api.ts frontend/src/lib/nav.ts frontend/src/App.tsx
git commit -m "feat(interview): records list + interviewer scorecard + route split (G4,G5)"
```

> **Phase C 验收**：AI 面试提交"通过"→候选人在流程自动进一面；`/interviews` 列出 AI + 反馈记录、AI 记录可点进报告；面试官能提交评分。

---

## Final Verification (Batch 1 全量)

- [ ] **后端全测**：`cd backend && python -m pytest -q` → 全绿。
- [ ] **后端启动**：`python -c "from app import create_app; create_app()"` 无错。
- [ ] **前端类型**：`cd frontend; npx tsc --noEmit` → exit 0。
- [ ] **端到端冒烟**（可选，参 M0 的活体 HTTP 流程）：注册→只能得 recruiter；admin 改角色；候选人走多轮；AI 面试回写；/interviews 有记录。
- [ ] 清理临时文件（server 日志等）。




