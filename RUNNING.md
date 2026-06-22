# 智聘 · 快速启动

## 前置条件

- Python 3.9+
- pip 安装依赖：`pip install -r backend/requirements.txt`

---

## 启动后端

```bash
cd backend
PORT=5001 python run.py
```

开发联调后端固定使用 http://localhost:5001，前端开发服务会代理到这个端口。

---

## MVP 内部试用账号

密码统一：`Zhipin2026`

| 角色 | 邮箱 | 姓名 |
|------|------|------|
| 管理员 | admin01@mvp.local | 系统管理员 |
| 招聘经理 | manager01@mvp.local | 招聘经理01 |
| 招聘负责人 | lead01@mvp.local | 招聘负责人01 |
| 招聘专员 | hr01@mvp.local | 招聘专员01 |
| 招聘专员 | hr02@mvp.local | 招聘专员02 |
| 招聘专员 | hr03@mvp.local | 招聘专员03 |
| 面试官 | interviewer01@mvp.local | 面试官01 |

推荐给招聘专员一人一个账号。原因很简单：系统会把候选人负责人、上传人、流程推进人、面试反馈人都记录到具体用户 ID 上；BI 主绩效按候选人负责人汇总面试进入量、面试通过量、Offer 和入职等指标，流程推进人则用于操作留痕和后续动作审计。

如果多人共用一个账号，BI 只能看到“这个共用账号做了多少事”，看不出每个人的实际贡献。MVP 试用阶段可以把所有账号密码都告诉试点人员，但使用时仍建议各自登录自己的账号。

推荐用 **manager01@mvp.local** 或 **lead01@mvp.local** 登录，可看到完整 BI 看板和团队数据。

BI 看板的时间筛选只支持近 7 天、近 30 天、近 90 天；非法参数会回退默认周期。看板里的“当前流程人数”只算仍在推进中的候选人，不含已入职和已淘汰；“全流程入职占比”按活跃流程加归档结果去重计算。招聘专员如果只是协作某个岗位，只能在岗位 BI 看到自己负责候选人的漏斗。

面试官账号 **interviewer01@mvp.local** 只保留工作台和“我的面试”主入口。面试官可以从面试任务进入候选人详情查看材料并填写反馈；不会显示“推进 Offer/淘汰”等流程按钮，也不开放全量简历库、候选人管道、AI 助手主入口、岗位级 BI 或专员级 BI。

管理员账号用于创建账号、重置密码和管理角色。当前 MVP 还不是完整企业管理员后台，暂未提供全量数据导出审批、导出水印、字段级权限等企业治理能力。

### 可直接转发的试用说明

请用分配的账号登录试用智聘。这个系统主要帮我们看清候选人推进到哪一步、谁处理了什么、哪里卡住了，也方便月底复盘招聘专员推进量和面试反馈情况。招聘专员主要看候选人和流程，经理/负责人主要看 BI 看板，面试官主要处理“我的面试”和填写反馈。试用后请直接反馈哪里不好用、哪里数据不够清楚。

---

## 重置试用数据

```bash
cd backend
python seed_dev.py
```

清空并重新写入试用用户、20 个候选人、14 个岗位及面试记录。不需要 LLM Key。

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
npm run dev      # http://localhost:5173，代理到 :5001
npm run build    # 重新构建后提交 frontend/dist/
```

开发时只保留一个前端地址：`http://localhost:5173`。如果 5173 被占用，Vite 会直接报错，不会自动跳到 5174/5175。

## 临时外链试用

给内部同事临时试看时，可以用 Cloudflare Tunnel 或 localtunnel 把本机 `5173` 暴露出去。前端开发服务已允许 `.trycloudflare.com` 和 `.loca.lt` 临时域名访问。

优先使用 Cloudflare Tunnel：

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --protocol http2
```

如果看到 localtunnel 的英文/中文安全确认页，说明那是 localtunnel 免费通道的访问确认，不是产品报错。面向 HR 试用时优先改用 Cloudflare Tunnel 链接。
