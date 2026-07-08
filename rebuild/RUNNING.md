# rebuild 运行说明

本文件描述当前 `rebuild/` 壳层的本地联调方式，并说明和真实用户小范围试点的区别。真实试点部署细节见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 前置条件

- Node.js / npm：用于启动 `frontend/` (React 18)
- JDK 21：`rebuild/backend-java/pom.xml` 中的 `java.version` 为 `21`
- Maven 3.9+：用于启动 Spring Boot 后端

macOS + Homebrew 安装 `openjdk@21` 后，需要把 JDK 接到当前 shell。可写入 `~/.zprofile` 或 `~/.zshrc`：

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

验证：

```bash
java -version
javac -version
mvn -version
```

## 前端

在 `frontend/` 下执行：

```bash
npm install
npm run dev
```

- 默认端口：`5173`
- 默认 API base：`/api/v1`
- 框架：`React 18 + TypeScript`
- `/api/v1` 请求会通过 Vite 代理转发到 `http://localhost:8080`
- 如后端不在 8080，可用 `VITE_API_BASE_URL` 覆盖

## LLM 配置（简历解析）

简历解析功能依赖 LLM API。可以通过环境变量或 `application.yml` 配置：

```bash
# OpenAI（默认）
export LLM_PROVIDER=openai
export LLM_API_KEY=sk-your-key-here
export LLM_API_URL=https://api.openai.com/v1/chat/completions
export LLM_MODEL_FAST=gpt-4o-mini
export LLM_MODEL_THINK=gpt-4o
export LLM_MODEL_PRO=o3-mini

# DeepSeek
export LLM_PROVIDER=deepseek
export LLM_API_KEY=sk-your-deepseek-key
export LLM_API_URL=https://api.deepseek.com/v1/chat/completions
export LLM_MODEL_FAST=deepseek-v4-flash
export LLM_MODEL_THINK=deepseek-v4-flash
export LLM_MODEL_PRO=deepseek-v4-pro
```

如未配置 API Key，解析服务会返回 mock 数据，确保开发阶段不阻塞。

模型路由：
| 路由 | 用途 | 默认模型 |
|------|------|---------|
| `fast` | 结构化信息抽取（简历解析） | gpt-4o-mini |
| `think` | 中等复杂度推理 | gpt-4o |
| `pro` | 高难度推理 | o3-mini |

## 后端

本地空库联调可先启动 PostgreSQL。Docker / Colima 示例：

```bash
colima start
docker run --name hireinsight-java-postgres \
  -e POSTGRES_DB=hireinsight \
  -e POSTGRES_USER=hi \
  -e POSTGRES_PASSWORD=hipass \
  -p 5432:5432 \
  -d postgres:16-alpine
```

在 `rebuild/backend-java` 下执行：

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

- 默认端口：`8080`
- 默认数据源按 `src/main/resources/application.yml` 连接本机 PostgreSQL：
  - `DATABASE_URL` 默认 `jdbc:postgresql://localhost:5432/hireinsight`
  - `DATABASE_USER` 默认 `hi`
  - `DATABASE_PASSWORD` 默认 `hipass`
- 本地空库首次联调用 `dev` profile 创建/更新表结构；默认 profile 是 `ddl-auto: validate`，适合已有表结构时做校验
- `JWT_SECRET` 本地默认使用可启动的占位密钥；真实试点必须使用 `pilot` profile 并改成 32 字符以上的强随机值
- 测试环境使用 H2 内存库，运行 `mvn test` 不需要本机 PostgreSQL

`dev` profile 会在账号不存在时自动初始化一组**与原 Python 版 `backend/seed_dev.py` 对齐的本地演示账号**。这些账号只用于本地演示，不用于真实数据试点：

| 角色 | 邮箱 | 密码 | 主要试跑路径 |
|---|---|---|---|
| 招聘专员 | `hr01@mvp.local` / `hr02@mvp.local` / `hr03@mvp.local` | `Zhipin2026` | 工作台、上传简历、简历库、加入流程、安排面试 |
| 招聘经理/负责人 | `manager01@mvp.local` / `lead01@mvp.local` | `Zhipin2026` | 团队看板、招聘管理、候选人归属、流程卡点 |
| 面试官 | `interviewer01@mvp.local` | `Zhipin2026` | 面试任务、候选人材料查看、反馈边界 |
| 管理员 | `admin01@mvp.local` | `Zhipin2026` | 用户治理、系统设置、审计日志、权限边界 |

如果本机数据库里曾经存在旧 Java demo 账号，例如 `demo.*@hireinsight.local` 或 `demo@hireinsight.local`，它们只是旧本地数据残留；新的 Java + Vue 本地试用请优先使用上表的 Python 原版账号。改完代码后需要重启 Java 后端，`dev` 初始化器才会补齐缺失账号。

## 联调时优先核对的页面事实

1. 管理员用户治理页支持 `list / create / edit / reset-password`，且属于 `demo-only` 账号治理壳层。
2. 简历库页面明确说明“上传后会真实写入 Java rebuild 的 PostgreSQL dev 数据库（当前同步写入，简历 JSON 暂为占位，尚未接真实解析链路）”，并提供“加入流程”入口。
3. 上传简历入口位于侧边栏“上传简历”；简历库空数据时也会引导到该入口。
4. 候选人流程看板为空时会提示先上传简历并在简历库加入流程；误推进可查看历史并纠正。
5. 面试任务页支持招聘专员/负责人/管理员安排面试草稿；面试官列表只展示自己的面试记录。
6. 经理/负责人工作台会展示团队看板提示，覆盖岗位进展、候选人归属、招聘专员绩效和流程卡点。
7. AI 助手页已有会话列表、详情和 confirm-first 消息发送 demo；写操作只生成确认卡，继续受当前账号权限约束，调用日志仍不能包装成生产级审计能力。
8. `revert-lite` 仅作为 demo / legacy correction path；`offer / onboarded / rejected` 只表示当前重构壳层里的阶段记录边界。

## 小范围试点已知限制

- 目前适合小范围产品试点，不等于生产上线；真实数据安全、备份、合规、监控和运维保障仍未完成。
- 面试安排表单当前填写候选人 ID、岗位 ID、面试官账号 ID；后续应改为可搜索选择器。
- 误推进已有历史查看与纠正入口；误关闭岗位、误淘汰、负责人分错仍需要负责人或管理员记录后手动修正。
- 招聘专员 BI 统计按自己的岗位 owner_hr_id 与候选人 owner_hr_id 计算；经理/管理员当前看全局范围（demo 阶段未按团队细分，后续需补团队归属模型）。
- 系统设置里的系统治理能力与 AI 助手仍是 demo / in-memory 壳层，不能作为生产级配置中心、审计中心或自动写操作系统。

## 真实用户小范围试点运行口径

真实试点不要使用 `dev` profile，改用 `pilot` profile：

```bash
cd rebuild/backend-java
mvn spring-boot:run -Dspring-boot.run.profiles=pilot
```

`pilot` profile 会做启动前安全检查：

- `JWT_SECRET` 不能是默认弱值。
- `DATABASE_PASSWORD` 不能是 `hipass`。
- `CORS_ALLOWED_ORIGINS` 不能是 `*`。
- `PUBLIC_REGISTRATION_ENABLED` 必须为 `false`。
- `UPLOAD_FOLDER` 不能放在 `/tmp`。
- 数据库里不能残留 `demo.*@hireinsight.local`、`demo@hireinsight.local` 或 `*@mvp.local` 演示账号。

真实账号创建方式：

1. 首次启动时临时配置 `PILOT_BOOTSTRAP_ADMIN_EMAIL` 和 `PILOT_BOOTSTRAP_ADMIN_PASSWORD`。
2. 用该管理员登录后，在“用户治理”里创建招聘专员、负责人、面试官账号。
3. 删除 bootstrap 环境变量并重启后端，避免固定初始化密码长期留在服务器。

真实试点数据不会被 seed/reset 覆盖：`DevPilotAccountInitializer` 只在 `dev` profile 生效，`pilot` 不会自动写入 demo 账号。备份与恢复脚本见 [DEPLOYMENT.md](./DEPLOYMENT.md)。
