# 智聘招聘管理系统 MCP 服务

[Model Context Protocol](https://modelcontextprotocol.io/) (MCP) 服务，将智聘招聘管理系统的完整功能封装为标准化工具，供 AI 助手（如 Claude）和第三方应用调用。

## 功能概览

本 MCP 服务覆盖智聘系统的全部 14 个 API 模块，提供 60+ 个工具：

| 模块 | 工具前缀 | 主要功能 |
|------|----------|----------|
| 认证 | `zhiping_*` | 登录、注册、获取用户信息、修改密码 |
| 候选人 | `zhiping_list_candidates` 等 | 候选人列表、详情、旅程、转派 |
| 岗位 | `zhiping_*_job` 等 | 岗位CRUD、AI匹配、批量添加 |
| 招聘流程 | `zhiping_*_pipeline` 等 | 阶段推进、看板、Offer管理 |
| 面试 | `zhiping_*_interview` 等 | AI预筛选、面试官反馈、安排 |
| BOSS直聘 | `zhiping_boss_*` 等 | 账号管理、推荐、收件箱、导入 |
| BI看板 | `zhiping_bi_*` 等 | 数据总览、绩效、漏斗分析 |
| 系统管理 | `zhiping_admin_*` 等 | 用户管理、审计日志 |
| AI助手 | `zhiping_agent_*` 等 | 对话管理、调用日志 |
| 通知 | `zhiping_*_notification` 等 | 通知列表、未读数、标记已读 |

## 快速开始

### 1. 安装

```bash
cd mcp
pip install -e .
```

### 2. 配置

设置环境变量：

```bash
# 后端API地址（默认 http://localhost:5001）
export ZHIPING_API_URL="http://localhost:5001"

# JWT认证token（从登录接口获取）
export ZHIPING_JWT_TOKEN="your_jwt_token_here"

# 可选：请求超时时间（秒）
export ZHIPING_REQUEST_TIMEOUT="30"

# 可选：调试模式
export ZHIPING_DEBUG="false"
```

### 3. 运行

#### stdio 模式（推荐用于本地AI助手）

```bash
zhiping-mcp
# 或
python -m zhiping_mcp.server
```

#### HTTP/SSE 模式（用于远程调用）

```bash
zhiping-mcp --transport sse --host 0.0.0.0 --port 8080
```

## 与 Claude Desktop 集成

### 配置文件位置

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 配置内容

```json
{
  "mcpServers": {
    "zhiping": {
      "command": "zhiping-mcp",
      "env": {
        "ZHIPING_API_URL": "http://localhost:5001",
        "ZHIPING_JWT_TOKEN": "your_token_here"
      }
    }
  }
}
```

### 使用示例

配置完成后，你可以在 Claude 中直接使用自然语言调用智聘功能：

- "帮我查看所有待处理的候选人"
- "创建一个前端开发岗位"
- "把这个候选人推进到面试阶段"
- "查看BOSS直聘的推荐候选人"
- "生成本月的招聘数据报告"

## 可用工具列表

### 认证工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_login` | 登录系统 |
| `zhiping_register` | 注册新用户 |
| `zhiping_get_me` | 获取当前用户信息 |
| `zhiping_change_password` | 修改密码 |

### 候选人工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_list_candidates` | 获取候选人列表（支持搜索、筛选） |
| `zhiping_get_candidate` | 获取候选人详情 |
| `zhiping_get_candidate_pipelines` | 获取候选人的应聘流程 |
| `zhiping_get_candidate_journey` | 获取候选人完整旅程 |
| `zhiping_update_candidate_profile` | 更新候选人档案 |
| `zhiping_reassign_candidate` | 转派候选人负责人 |

### 岗位工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_list_jobs` | 获取岗位列表 |
| `zhiping_get_job` | 获取岗位详情 |
| `zhiping_create_job` | 创建岗位（自动生成结构化JD） |
| `zhiping_update_job` | 更新岗位 |
| `zhiping_close_job` | 关闭岗位 |
| `zhiping_restore_job` | 恢复岗位 |
| `zhiping_run_job_match` | 运行AI智能匹配 |
| `zhiping_preview_job_match` | 预览匹配结果 |
| `zhiping_batch_add_to_pipeline` | 批量添加到招聘流程 |
| `zhiping_clarify_job` | 生成JD澄清问题 |

### 招聘流程工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_move_candidate` | 推进候选人阶段 |
| `zhiping_get_pipeline_stages` | 获取阶段分布 |
| `zhiping_get_pipeline_board` | 获取看板数据 |
| `zhiping_get_candidate_pipeline_history` | 获取阶段流转历史 |
| `zhiping_get_offer_record` | 获取Offer记录 |
| `zhiping_save_offer_record` | 保存Offer记录 |

### 面试工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_start_ai_interview` | 启动AI预筛选 |
| `zhiping_submit_interview_answers` | 提交面试答案 |
| `zhiping_get_interview_report` | 获取面试报告 |
| `zhiping_get_interview_guide` | 获取面试指引 |
| `zhiping_submit_interviewer_feedback` | 提交面试官反馈 |
| `zhiping_list_interviews` | 获取面试列表 |
| `zhiping_list_interviewers` | 获取面试官列表 |
| `zhiping_create_interview_assignment` | 创建面试安排 |
| `zhiping_list_interview_assignments` | 获取面试安排列表 |

### BOSS直聘工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_boss_check_status` | 检查登录状态 |
| `zhiping_boss_import_cookie` | 导入Cookie |
| `zhiping_boss_list_accounts` | 列出账号 |
| `zhiping_boss_switch_account` | 切换账号 |
| `zhiping_boss_verify_account` | 验证账号 |
| `zhiping_boss_delete_account` | 删除账号 |
| `zhiping_boss_list_jobs` | 获取在招职位 |
| `zhiping_boss_get_recommendations` | 获取推荐候选人 |
| `zhiping_boss_get_inbox` | 获取收件箱 |
| `zhiping_boss_get_resume` | 获取简历 |
| `zhiping_boss_batch_import` | 批量导入 |
| `zhiping_boss_ai_screen` | AI初筛 |
| `zhiping_boss_get_labels` | 获取标签 |
| `zhiping_boss_get_chat_history` | 获取聊天记录 |
| `zhiping_boss_export` | 导出候选人 |

### BI工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_bi_overview` | 获取数据总览 |
| `zhiping_bi_staff_performance` | 获取专员绩效 |
| `zhiping_bi_job_funnel` | 获取岗位漏斗 |

### 管理工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_admin_list_users` | 列出用户 |
| `zhiping_admin_create_user` | 创建用户 |
| `zhiping_admin_update_user` | 更新用户 |
| `zhiping_admin_reset_password` | 重置密码 |
| `zhiping_admin_ai_architecture` | AI架构仪表盘 |
| `zhiping_admin_audit_logs` | 审计日志 |

### AI助手工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_agent_list_tools` | 获取AI工具列表 |
| `zhiping_agent_list_conversations` | 获取对话列表 |
| `zhiping_agent_create_conversation` | 创建对话 |
| `zhiping_agent_get_conversation` | 获取对话详情 |
| `zhiping_agent_rename_conversation` | 重命名对话 |
| `zhiping_agent_archive_conversation` | 归档对话 |
| `zhiping_agent_list_call_logs` | 获取调用日志 |

### 通知工具

| 工具名 | 说明 |
|--------|------|
| `zhiping_list_notifications` | 获取通知列表 |
| `zhiping_get_unread_count` | 获取未读数 |
| `zhiping_mark_notifications_read` | 标记已读 |

## 开发

### 项目结构

```
mcp/
├── README.md
├── pyproject.toml
├── src/
│   └── zhiping_mcp/
│       ├── __init__.py
│       ├── server.py          # MCP服务器主文件
│       ├── client.py          # HTTP客户端
│       ├── config.py          # 配置管理
│       └── tools/
│           ├── __init__.py
│           ├── auth.py        # 认证工具
│           ├── candidates.py  # 候选人工具
│           ├── jobs.py        # 岗位工具
│           ├── pipeline.py    # 招聘流程工具
│           ├── interview.py   # 面试工具
│           ├── boss.py        # BOSS直聘工具
│           ├── bi.py          # BI工具
│           ├── admin.py       # 管理工具
│           ├── agent.py       # AI助手工具
│           └── notifications.py # 通知工具
└── tests/
    └── test_server.py
```

### 添加新工具

1. 在 `tools/` 目录下创建或编辑对应的模块文件
2. 使用 `@mcp.tool()` 装饰器定义工具函数
3. 在 `tools/__init__.py` 中导出注册函数
4. 在 `server.py` 中调用注册函数

示例：

```python
from mcp.server import Server
from ..client import client

def register_example_tools(mcp: Server):
    @mcp.tool()
    async def zhiping_example(param1: str, param2: int = 10) -> dict:
        """工具描述

        Args:
            param1: 参数1说明
            param2: 参数2说明（默认10）

        Returns:
            返回值说明
        """
        result = await client.request("GET", "/example", params={"p1": param1})
        return result
```

### 测试

使用 MCP Inspector 测试：

```bash
# 安装MCP Inspector
npx @modelcontextprotocol/inspector

# 或者直接运行服务器进行测试
ZHIPING_JWT_TOKEN="your_token" zhiping-mcp
```

## 常见问题

### Q: 如何获取 JWT Token？

1. 启动智聘后端服务
2. 调用登录接口：`POST /api/auth/login`
3. 从响应中获取 `token` 字段
4. 设置到环境变量 `ZHIPING_JWT_TOKEN`

### Q: 支持哪些AI助手？

- Claude Desktop（推荐）
- Cursor
- Windsurf
- 任何支持 MCP 协议的AI助手

### Q: 如何修改默认端口？

SSE模式下可通过 `--port` 参数指定：

```bash
zhiping-mcp --transport sse --port 9090
```

## 许可证

MIT License
