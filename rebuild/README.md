# 智聘重构 MVP — Java Spring Boot + Vue 技术栈

> 本目录存放以 **Java 21 + Spring Boot 3.2.5 + Vue 3 + TypeScript** 重新实现智聘 MVP 的代码。
> 当前状态：**项目脚手架阶段**，仅完成基础设施骨架，业务代码尚未开始编写。

---

## 当前状态概览

| 层 | 进展 | 说明 |
|---|---|---|
| 后端 Java 骨架 | 已完成 | pom.xml, 安全配置, JWT, 健康检查, 全局异常处理, 三环境配置 |
| 后端业务代码 | 未开始 | 无 Entity/Repository/Service/Controller |
| 前端 Vue 骨架 | 已完成 | 路由定义, Pinia 状态管理, HTTP 客户端, 类型定义, Tailwind 配置 |
| 前端页面视图 | 未开始 | 路由指向的 `views/` 和 `layouts/` 组件尚未创建 |
| 测试 | 未开始 | 后端和前端均无测试代码 |
| Docker/部署 | 未开始 | 无 Dockerfile 或 docker-compose.yml |

---

## 目录结构

```
rebuild/
├── README.md                          ← 本文件
├── backend-java/                      ← Spring Boot 后端
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/hireinsight/
│       │   ├── HireInsightApplication.java    ← 应用入口
│       │   ├── auth/                           ← JWT 认证
│       │   ├── common/                         ← 统一响应 + 全局异常处理
│       │   ├── config/                         ← 安全 + JPA + 通用配置
│       │   └── health/                         ← 健康检查
│       └── resources/
│           └── application.yml                 ← 三环境配置
└── frontend-vue/                      ← Vue 3 前端
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.ts                              ← 应用入口
        ├── App.vue                              ← 根组件
        ├── router/index.ts                      ← 路由定义
        ├── stores/auth.ts                       ← 登录状态管理
        ├── api/http.ts                          ← HTTP 客户端
        ├── types/index.ts                       ← 类型定义
        └── styles/index.css                     ← 全局样式
```

---

## 需完成的工作

详见 [docs/15_JavaSpringBootVue重构MVP状态报告.md](../docs/15_JavaSpringBootVue重构MVP状态报告.md) 第 3 节。

---

## 与主项目（Flask + React）的关系

主项目 `backend/` + `frontend/` 是当前可运行的智聘系统，采用 Flask + React 技术栈，用于内测和演示。
`rebuild/` 是技术栈迁移方向，当前尚不具备运行能力。两套代码共存，互不干扰。

> 详细的状态分析和缺项清单，见 [docs/15_JavaSpringBootVue重构MVP状态报告.md](../docs/15_JavaSpringBootVue重构MVP状态报告.md)
