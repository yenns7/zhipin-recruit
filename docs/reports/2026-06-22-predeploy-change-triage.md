# 2026-06-22 部署前变更分拣

本报告只整理当前工作区变更，不代表已经可以给真实用户开放。

## 可纳入上线收口

- 部署前自检：`backend/scripts/check_pilot_readiness.py`、`backend/tests/test_deployment_artifacts.py`、`DEPLOYMENT.md`、`docs/06_试点上线检查清单.md`、`docs/07_上线部署前TOP10清单_给AI执行.md`。
- demo 数据清理脚本：`backend/scripts/cleanup_demo_data.py`，默认 dry-run，`--confirm` 才会先备份再删除 demo 账号、关联业务数据和上传文件。
- 生产配置模板和 LLM key 说明：`backend/.env.example`、`DEPLOYMENT.md`、`RUNNING.md`。
- AI 助手权限收口：`backend/app/api/agent.py`、`backend/app/services/agent_service.py`、`backend/tests/test_agent_conversations.py`、`backend/tests/test_admin_ai_architecture.py`、`frontend/src/pages/admin/AiArchitecturePage.tsx`。
- 试点体验补缺：候选人搜索、只读岗位匹配预览、用人需求恢复、候选人流程空阶段引导、面试反馈直达、账号管理收起创建表单、BI 文案收口。
- 对应产品和技术文档已同步到 `README.md`、`RUNNING.md`、`docs/01_PRD.md`、`docs/03_BI看板设计.md`、`docs/06_试点上线检查清单.md`、`docs/SDD-智聘招聘系统-v1.0.md` 等。
- 历史上传附件清理：`backend/uploads/1cf95bf6-2965-4182-a833-e264aeab0eab_--.docx` 和 `backend/uploads/zip_b81abc3bc0044d879f1f9aa9978efa7d/fc44cbef26474d8980ef62d8aaf27554_A.pdf` 已按负责人确认删除。

## 不能直接上线

- 当前真实 `backend/.env` 仍未通过上线自检：JWT 太短、`FLASK_DEBUG=true`、仍为 SQLite、CORS/限流/备份/公开注册等生产显式配置缺失。
- 当前本机自检 13 项里 11 项 FAIL；这些是服务器侧必填项，不是已完成配置。
- 还没有公司 PostgreSQL 连接串、公司域名、HTTPS 证书路径、生产 LLM 合规结论。
- 还没有执行真实服务器冒烟：登录、建岗位、传简历、加入流程、推进、面试、反馈、Offer、BI。
- Python 依赖安全审计已处理：`pypdf` 升到 `6.13.3`，`langsmith` 显式锁到 `0.8.18`，本地 `pip` 升到 `26.1.2`。`pip_audit --local` 和 pinned requirements 审计均已无已知漏洞。

## 需要人工确认

- 是否把当前大批产品体验改动作为一个“试点体验收口包”一起提交，还是拆成多个提交。
- 是否先在本机生成一份示例生产 `.env`，还是等公司 IT 提供域名、数据库和证书后再配置服务器。
- demo 数据真实删除前必须先查看 `cleanup_demo_data.py --dry-run` 输出，并确认备份方案和清理范围。

## 不应纳入提交

- `tmp/` 下的 BI 截图是临时验收截图，已加入 `.gitignore`，不进入上线提交。

## 已验证

- `.venv312/bin/python -m pytest backend/tests/test_deployment_artifacts.py backend/tests/test_pilot_hardening.py -q`：13 passed。
- `.venv312/bin/python -m pytest backend/tests -q`：146 passed。
- `cd frontend && npm run lint`：通过。
- `cd frontend && npm run typecheck`：通过。
- `cd frontend && npm run build`：通过。
- `for f in frontend/tests/*.test.mjs; do node "$f" || exit $?; done`：通过。
- `cd frontend && npm audit --audit-level=moderate`：0 vulnerabilities。
- `.venv312/bin/python -m pip_audit --local`：No known vulnerabilities found。
- `.venv312/bin/python -m pip_audit -r backend/requirements.txt --no-deps --disable-pip`：No known vulnerabilities found。

## 下一步建议

1. 先跑 `python backend/scripts/cleanup_demo_data.py --dry-run`，把清理范围贴给负责人确认。
2. 跑前端完整门禁：`npm run lint`、`npm run typecheck`、`npm run build`、`frontend/tests/*.test.mjs`。
3. 等 IT 信息齐全后配置服务器 `.env`，再跑 `python backend/scripts/check_pilot_readiness.py`。
4. 在真实服务器上跑真人冒烟 10 步，并确认日志、备份和回滚预案。
