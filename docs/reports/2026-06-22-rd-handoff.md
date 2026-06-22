# 2026-06-22 智聘研发交接说明

## 交接目标

请公司研发/IT 将当前智聘内测基线部署到公司测试或预生产服务器，供少数 HR 使用真实数据做小范围试点。

当前交接包是部署接手包，不是已完成生产上线包。真实用户开放前必须完成配置、合规、备份和冒烟验收。

## 收到代码后先做什么

1. 解压交接包到服务器或研发本机。
2. 按 `DEPLOYMENT.md` 安装后端和前端依赖。
3. 复制 `backend/.env.example` 为服务器上的 `backend/.env`。
4. 在服务器 `backend/.env` 填入生产配置，不要把真实 `.env` 提交进 git。
5. 从项目根目录运行：

```bash
python backend/scripts/check_pilot_readiness.py
```

只有自检通过，才继续构建前端、启动后端和做真人冒烟。

当前开发机 `backend/.env` 不是生产配置，运行自检会失败：13 项检查里 11 项 FAIL，包括 `JWT_SECRET` 太短、`FLASK_DEBUG=true`、仍使用 SQLite、`CORS_ORIGINS`/限流/备份目录/关闭公开注册等显式配置缺失。这些不是已完成项，而是服务器侧部署前必须填写和验收的必填项。

## 必须由公司提供或确认

- PostgreSQL 数据库地址、账号和密码。
- 公司访问域名，用于 `CORS_ORIGINS` 和 HTTPS。
- HTTPS 证书路径，或公司统一网关/负载均衡方案。
- 生产 `JWT_SECRET`，必须是强随机值，长度不少于 32。
- `BACKUP_DIR` 服务器备份目录。
- LLM API Key 以及真实简历是否允许外发给 DeepSeek/第三方 LLM 的合规结论。
- 试点账号名单：管理员、招聘专员、招聘经理/负责人、面试官。

## 清理 demo 数据

交接包提供了清理脚本，但默认只预览，不会删除：

```bash
python backend/scripts/cleanup_demo_data.py --dry-run
```

确认备份目录、数据库和清理范围无误后，才允许人工执行：

```bash
python backend/scripts/cleanup_demo_data.py --confirm
```

脚本会先调用备份逻辑备份数据库和上传目录，再删除 `@mvp.local` demo 账号及其关联业务数据，并清空 `backend/uploads/` 和 `uploads/` 文件。不要在还没确认备份的情况下执行 `--confirm`。

## 不能放进交接包或 git

- `backend/.env`
- 真实 API Key、数据库密码、JWT 密钥
- `backend/hireinsight.db`、任何 `.db` / `.sqlite` 文件
- `backend/uploads/`、`uploads/` 里的真实或演示简历
- `.venv*`、`node_modules/`、`frontend/dist/`
- 临时截图、日志、缓存

## 上线前验收门禁

```bash
python backend/scripts/check_pilot_readiness.py
python -m pytest backend/tests base_agent/tests -q
cd frontend && npm run lint && npm run typecheck && npm run build
for f in frontend/tests/*.test.mjs; do node "$f" || exit $?; done
python -m pip_audit -r backend/requirements.txt --no-deps --disable-pip
cd frontend && npm audit --audit-level=moderate
```

说明：当前 Python 3.12 环境下，`pip_audit -r` 的默认依赖解析模式可能在临时 venv 创建阶段崩溃；本项目依赖均固定版本，交接时使用 `--no-deps --disable-pip` 审计 pinned requirements。

## 真实用户冒烟 10 步

1. 管理员登录并创建试点账号。
2. 招聘专员创建岗位或用人需求。
3. 上传一份测试简历，确认入简历库。
4. 在简历库选择目标岗位，查看岗位匹配摘要。
5. 将候选人加入所选岗位流程。
6. 在候选人流程里推进阶段。
7. 安排面试。
8. 面试官从“我的面试”填写反馈。
9. HR 推进 Offer 或淘汰，并检查误操作修正入口。
10. 经理/负责人查看 BI，看能否解释谁负责、卡在哪、反馈是否补齐。

## 当前已知限制

- 本阶段不接 OA。
- 不做对象存储，上传文件仍由服务器本地目录承载，必须和数据库一起备份。
- 不做多租户。
- 不提供完整企业级审批、导出水印、字段级权限。
- AI 简历解析涉及第三方 API，必须先过公司合规确认。

## 推荐部署顺序

1. 先部署到公司测试或预生产环境。
2. 在服务器填写真实 `.env`，跑通 `check_pilot_readiness.py`。
3. 用假数据跑完自动化测试和真人冒烟。
4. 确认备份、日志、回滚方案。
5. 经负责人确认后执行 `cleanup_demo_data.py --confirm`，再创建真实账号。
6. 开放给少数 HR 试点。
