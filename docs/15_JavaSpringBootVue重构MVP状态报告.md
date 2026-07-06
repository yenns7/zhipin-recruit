# 15 · Java Spring Boot + Vue 重构 MVP 状态报告

> 日期：2026-07-06
> 目标：记录 `rebuild/` 目录下以 Java + Spring Boot + Vue 技术栈重新实现智聘 MVP 的真实状态。
> 适用对象：研发、技术决策者、需要判断"新栈重构做到哪了"的协作者。

---

## 1. 结论先行

当前 `rebuild/` 处于**项目脚手架阶段**：

- **技术基础设施骨架已完成**：Spring Boot 3.2.5 项目结构、Maven 配置、安全框架、JWT、全局异常处理、健康检查、JPA 配置三环境（dev/test/prod）已落地。
- **产品代码尚未开始编写**：无业务实体（Entity）、无 Repository、无 Service、无 Controller、无数据库迁移脚本。
- **前端路由/状态管理骨架已完成**：Vue 3 + Pinia + Vue Router + Tailwind 项目已初始化，登录态管理和 6 个页面路由定义就绪，但对应的视图组件（`views/`）尚未创建。

**当前不适合宣称"MVP 已可运行"或"可以试点"，仅适合作为"新栈重构起点"。**

---

## 2. 已完成

### 2.1 后端 Java Spring Boot 骨架

| 项目 | 证据 |
|------|------|
| Maven pom.xml | `rebuild/backend-java/pom.xml` — Spring Boot 3.2.5, Java 21, spring-boot-starter-web/data-jpa/security/validation, jjwt 0.12.5, springdoc 2.5.0, PostgreSQL/H2, Lombok |
| 应用入口 | `HireInsightApplication.java` — `@SpringBootApplication` |
| 安全配置 | `WebSecurityConfig.java` — Spring Security 配置, `JwtTokenProvider.java`, `JwtAuthenticationFilter.java`, `AuthException.java` |
| 通用层 | `ApiResponse.java` — 统一响应体; `GlobalExceptionHandler.java` — `@RestControllerAdvice` |
| 健康检查 | `HealthController.java` — `GET /health` |
| 配置 | `application.yml` — 三环境（dev/test/prod）, 数据库/H2, JWT, 上传, 时区 |
| JPA 配置 | `JpaConfig.java` — `@EnableJpaAuditing`; `AppConfig.java` — Jackson |

### 2.2 前端 Vue 骨架

| 项目 | 证据 |
|------|------|
| 项目配置 | `package.json` — Vue 3.4, Pinia 2.1, Vue Router 4.3, Vite 5.2, Tailwind 3.4, Vitest 1.4, TypeScript 5.4, vue-tsc 2.0 |
| 构建工具 | `vite.config.ts`, `tsconfig.json`, `postcss.config.js`, `tailwind.config.js`, `index.html` |
| 应用入口 | `main.ts` — createApp + Pinia + Router; `App.vue` — `<router-view />` |
| 路由定义 | `router/index.ts` — 6 条路由: Login, Dashboard, Candidates, Jobs, Pipeline, Interviews; 含 beforeEach 鉴权守卫 |
| 状态管理 | `stores/auth.ts` — token/setToken/logout |
| API 层 | `api/http.ts` — axios 封装含拦截器 |
| 类型定义 | `types/index.ts` — User/Role/LoginResponse/Candidate/Job/PipelineStage 等 |
| 样式 | `styles/index.css` — Tailwind 指令 |
| 类型补充 | `env.d.ts` — `/// <reference types="vite/client" />` |

---

## 3. 未完成

### 3.1 后端缺失清单

| 模块 | 缺失内容 |
|------|----------|
| 数据模型 | **全部 Entity 未创建** — User, Candidate, Job, PipelineStage, Interview, Resume, Event/BILog 等均无 JPA @Entity |
| Repository | 无 Spring Data JPA Repository 接口 |
| 业务服务 | 无 Service 类 — 认证/候选人/岗位/流程/面试/BI/BOSS 等均未实现 |
| 控制器 | 无业务 Controller — 只有 HealthController 一个非业务端点 |
| 数据库迁移 | 无 Flyway/Liquibase 迁移脚本 |
| DTO / 请求验证 | 无业务请求/响应对象 |
| 测试 | 无测试代码 |
| Docker | 无 `rebuild/` 下的 Dockerfile 或 docker-compose.yml |

### 3.2 前端缺失清单

| 模块 | 缺失内容 |
|------|----------|
| 页面视图 | 全部 `views/` 目录下视图组件未创建 — 路由指向 `@/views/login/LoginView.vue`、`@/views/dashboard/DashboardView.vue` 等但文件不存在 |
| 布局组件 | `layouts/AdminLayout.vue` 未创建 — 路由引用但文件不存在 |
| 业务组件 | 无表单、表格、流程看板、面试反馈、BI 图表等组件 |
| 页面级组件 | 无 Candidates/Jobs/Pipeline/Interviews 功能页面 |
| BOSS 集成 | 无 BOSS 模块相关代码 |
| AI 助手 | 无 Agent/会话/流式对话相关代码 |
| 测试 | 无测试代码 |

### 3.3 基础设施缺失

| 项目 | 状态 |
|------|------|
| Docker 构建 | `rebuild/` 下无 Dockerfile |
| Docker Compose | `rebuild/` 下无 docker-compose.yml |
| CI/CD 配置 | 无 |
| 部署文档 | `rebuild/` 下无部署/运行说明 |
| 环境变量模板 | 无 `.env.example` 在 `rebuild/` |

---

## 4. 与主项目（Flask + React）的关系

当前仓库维护两套技术栈：

| | 主项目 | 重构 MVP |
|---|---|---|
| 路径 | `backend/` + `frontend/` | `rebuild/backend-java/` + `rebuild/frontend-vue/` |
| 后端 | Flask 3.1 + SQLAlchemy + SQLite/PostgreSQL | Spring Boot 3.2.5 + JPA + PostgreSQL/H2 |
| 前端 | React 18 + Vite 8 + TypeScript + Tailwind | Vue 3.4 + Vite 5 + TypeScript + Pinia + Tailwind |
| 业务代码 | 完整（27+ API 路由，12 页面） | 骨架（仅基础设施） |
| 测试 | backend + frontend 数百个测试 | 无 |
| 适用阶段 | 当前内测/演示 | 新栈重构起点 |

主项目（Flask + React）是当前可运行版本；重构 MVP（Java + Vue）是技术栈迁移方向，当前尚不具备运行能力。

---

## 5. 剩余风险

1. **技术选型差异待验证**：Spring Boot 3.2.5 + JPA 是否能完全承接 Flask + SQLAlchemy + DeepSeek LangGraph 的 AI 流程编排能力，尚未在代码层面验证。
2. **前端 Vue 生态差异**：现有 React 页面（GSAP 动画、recharts 图表、SSE 流式 AI 对话）的 Vue 重新实现方案尚未评估。
3. **AI 引擎复用路径**：`base_agent/`（Python LangGraph）与 Java 后端之间如何集成（HTTP 桥接？Python 子进程？）尚无设计。
4. **数据库迁移**：从 SQLAlchemy 模型迁移到 JPA Entity 的数据结构和兼容性尚未评审。
5. **资源投入**：从当前 Flake + React 主项目切换到新栈，需要完整的开发周期和验证，当前仅有基础设施。

---

## 6. 下一步

1. 确定新 MVP 的产品范围（与主项目一致，还是缩小范围仅覆盖招聘主流程？）
2. 完成 ER 设计和 JPA Entity 建模
3. 逐个实现后端业务模块（认证 → 候选人 → 岗位 → 流程 → 面试 → BI）
4. 实现 Vue 视图组件（登录 → 工作台 → 候选人 → 岗位 → 流程 → 面试）
5. 补 Docker 构建和 docker-compose 编排
6. 补测试

---

## 7. 验证证据摘要

| 证据 | 路径 |
|------|------|
| Maven POM | `rebuild/backend-java/pom.xml` |
| 后端 Java 源文件 (10 个) | `rebuild/backend-java/src/main/java/com/hireinsight/` |
| 后端配置 | `rebuild/backend-java/src/main/resources/application.yml` |
| 前端 package.json | `rebuild/frontend-vue/package.json` |
| 前端源文件 (8 个) | `rebuild/frontend-vue/src/` |
| 前端构建配置 | `rebuild/frontend-vue/vite.config.ts` |

> 说明：本报告所有结论均以当前仓库文件和目录结构为唯一证据，不含任何假设或口头预期。
