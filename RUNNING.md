# 智聘 · 快速启动

## 前置条件

- Python 3.9+
- pip 安装依赖：`pip install -r backend/requirements.txt`

---

## 启动后端

```bash
cd backend
python run.py
```

访问 http://localhost:5000 — 前端页面由 Flask 直接托管（已内置构建产物，无需 Node）。

---

## 演示账号

密码统一：`demo1234`

| 角色 | 邮箱 | 姓名 |
|------|------|------|
| 管理员 | admin@demo.com | 系统管理员 |
| 经理 | manager@demo.com | 陈经理 |
| 招聘专员 | hr1@demo.com | 张专员 |
| 招聘专员 | hr2@demo.com | 李专员 |
| 招聘专员 | hr3@demo.com | 王专员 |
| 面试官 | interviewer@demo.com | 赵面试官 |

推荐用 **manager@demo.com** 登录，可看到完整 BI 看板和团队数据。

---

## 重置演示数据

```bash
cd backend
python seed_dev.py
```

清空并重新写入 29 个用户、20 个候选人、14 个岗位及面试记录。不需要 LLM Key。

---

## 需要 LLM Key 的功能

以下功能需要配置 API Key，其余功能（登录、候选人、岗位、流程、BI、面试报告）完全离线可用：

- JD 结构化解析
- AI 面试出题 & 评分
- 简历上传解析

创建 `backend/.env`（参考 `.env.example`）：

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-你的key
LLM_MODEL=deepseek-v4-flash
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
```

---

## 前端二次开发

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173，代理到 :5000
npm run build    # 重新构建后提交 frontend/dist/
```
