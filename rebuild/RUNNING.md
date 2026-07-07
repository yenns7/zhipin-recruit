# rebuild 运行说明

本文件只描述当前 `rebuild/` 壳层的最小联调方式，不把 demo 壳层包装成完整上线方案。

## 前端

在 `rebuild/frontend-vue` 下执行：

```bash
npm install
npm run dev
```

- 默认端口：`5173`
- `/api` 请求会通过 Vite 代理转发到后端

## 后端

在 `rebuild/backend-java` 下执行：

```bash
mvn spring-boot:run
```

- 默认端口：`8080`
- 实际数据源、profile 与环境变量以当前后端配置为准；本次文档收口不改后端代码

## 联调时优先核对的页面事实

1. 管理员用户治理页支持 `list / create / edit / reset-password`，且属于 `demo-only` 账号治理壳层。
2. 候选人列表页明确说明“上传后异步解析，成功后真实写入本地 rebuild 演示库”，不再写成纯前端临时态。
3. Agent 文档口径把“创建新会话”“AI 调用日志查询”视为已存在的演示壳层，不再标成未实现。
4. `revert-lite` 仅作为 demo / legacy correction path；`offer / onboarded / rejected` 只表示当前重构壳层里的阶段记录边界。
