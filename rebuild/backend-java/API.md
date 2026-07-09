# HireInsight API 接口文档

> **版本**: 0.1.0-SNAPSHOT
> **日期**: 2026-07-08
> **后端**: Java Spring Boot 3.2.5
> **基础路径**: `/api/v1`

---

## 通用说明

### 认证
- 除 `/api/v1/health` 和 `/api/v1/auth/login` 外，所有接口需在 Header 中携带 `Authorization: Bearer <token>`
- 登录成功后返回 JWT token，附带 `role` 和 `name`

### 响应格式
统一 `ApiResponse<T>` 结构：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... },
  "timestamp": 1719360000000
}
```

### 角色体系（升序）
```
admin > manager > recruiter > interviewer
```

### 分页
通用分页参数：`?page=0&size=20`

### 约定与边界

| 维度 | 说明 |
|------|------|
| **Demo-Stub** | 返回 in-memory 静态样例数据，不代表真实集成 |
| **Rule-Based** | 基于 JPA 聚合的规则计算，非真实数仓/BI 系统 |
| **DB 持久化** | 通知/Offer/处置/审计日志已持久化至 PostgreSQL，重启不丢失 |
| **进程内存** | BOSS 默认 demo 数据存于 `ConcurrentHashMap`，重启丢失；Agent 会话已持久化（见下） |
| **Flyway 持久化** | 已创建数据库表，真实写入 PostgreSQL |

---

## 1. 健康检查

**Controller**: `com.hireinsight.health.HealthController`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/health` | 公开 | 返回 status / database / service / version |

### 请求示例
```
GET /api/v1/health
```

### 响应示例
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "status": "UP",
    "database": "UP",
    "service": "hireinsight-api",
    "version": "0.1.0-SNAPSHOT",
    "checkedAt": "2026-07-08T10:00:00Z"
  },
  "timestamp": 1719360000000
}
```

> 数据库不可用时返回 HTTP 503。

---

## 2. 认证

**Controller**: `com.hireinsight.auth.AuthController` | 基础路径: `/api/v1/auth`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/auth/register` | 受 `publicRegistrationEnabled` 控制 | 用户注册 |
| POST | `/api/v1/auth/login` | 公开 | 登录，返回 JWT token |
| POST | `/api/v1/auth/logout` | 公开 | 登出，使 demo session 失效 |

### POST `/api/v1/auth/register`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "张三"
}
```

**响应**:
```json
{
  "code": 201,
  "message": "success",
  "data": {
    "id": 1,
    "email": "user@example.com",
    "role": "recruiter"
  },
  "timestamp": 1719360000000
}
```

> `name` 为可选字段。`publicRegistrationEnabled` 关闭时返回 403。

### POST `/api/v1/auth/login`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "role": "recruiter",
    "name": "张三"
  },
  "timestamp": 1719360000000
}
```

---

## 3. 用户管理

**Controller**: `com.hireinsight.auth.UserController` | 基础路径: `/api/v1`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/users/me` | 已认证 | 获取当前用户信息 |
| PUT | `/api/v1/users/me/password` | 已认证 | 修改当前用户密码 |
| GET | `/api/v1/admin/users` | ADMIN only | 管理员查看用户列表 |

### GET `/api/v1/users/me`

**响应**:
```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "张三",
    "email": "user@example.com",
    "role": "recruiter"
  }
}
```

### PUT `/api/v1/users/me/password`

**请求体**:
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

---

## 4. 岗位管理

**Controller**: `com.hireinsight.job.JobController` | 基础路径: `/api/v1/jobs`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/jobs` | 已认证 | 岗位列表，可按 status 过滤 |
| GET | `/api/v1/jobs/{id}` | 已认证 | 岗位详情 |
| POST | `/api/v1/jobs` | 已认证 | 创建岗位 |
| PUT | `/api/v1/jobs/{id}` | 已认证 | 更新岗位 |
| POST | `/api/v1/jobs/{id}/close` | 已认证 | 关闭岗位 |
| POST | `/api/v1/jobs/{id}/restore` | 已认证 | 恢复岗位 |

### GET `/api/v1/jobs`

**参数**: `?status=active`（可选）

> recruiter 只能查看自己的岗位；manager/admin 可查看全部。

### POST `/api/v1/jobs`

**请求体**:
```json
{
  "title": "高级 Java 工程师",
  "jdText": "负责后端系统设计与开发，3年以上Java经验..."
}
```

**响应** (HTTP 201):
```json
{
  "code": 201,
  "data": { "id": 42 }
}
```

### PUT `/api/v1/jobs/{id}`

**请求体**:
```json
{
  "title": "资深 Java 工程师",
  "jdText": "更新后的职位描述..."
}
```

> 所有字段可选，只发送需要更新的字段。

### POST `/api/v1/jobs/{id}/close`

关闭岗位，`status` 设置为 `closed`。

### POST `/api/v1/jobs/{id}/restore`

恢复岗位，`status` 设置为 `active`。

---

## 5. 候选人管理

**Controller**: `com.hireinsight.candidate.CandidateController` | 基础路径: `/api/v1/candidates`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/candidates` | 已认证 | 候选人列表 |
| GET | `/api/v1/candidates/{id}` | 已认证 | 候选人详情 |
| GET | `/api/v1/candidates/owner-options` | 已认证 | 负责人选项列表 |
| GET | `/api/v1/candidates/{id}/pipelines` | 已认证 | 候选人的流程记录 |
| GET | `/api/v1/candidates/{id}/journey` | 已认证 | 候选人旅程时间线 |
| PATCH | `/api/v1/candidates/{id}/owner` | 已认证 | 改派负责人 |

### GET `/api/v1/candidates/owner-options`

返回 recruiter / manager 列表，用于下拉选择。

### GET `/api/v1/candidates/{id}/pipelines`

返回候选人在各岗位的 pipeline 阶段记录。

### GET `/api/v1/candidates/{id}/journey`

按时间排序的 pipeline + event 合并列表，展示候选人完整流转轨迹。

### PATCH `/api/v1/candidates/{id}/owner`

**请求体**:
```json
{
  "ownerHrId": 5
}
```

---

## 6. 招聘需求

**Controller**: `com.hireinsight.demand.DemandController` | 基础路径: `/api/v1/demands`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/demands` | 已认证 | 需求列表 |
| POST | `/api/v1/demands` | 已认证 | 创建需求 |
| GET | `/api/v1/demands/{id}` | 已认证 | 需求详情 |
| PATCH | `/api/v1/demands/{id}` | 已认证 | 更新需求 |
| POST | `/api/v1/demands/{id}/close` | 已认证 | 关闭需求 |
| POST | `/api/v1/demands/{id}/restore` | 已认证 | 恢复需求 |
| POST | `/api/v1/demands/{id}/downgrade` | 已认证 | 降级需求 |

> 持久化: ✅ Flyway V10 — `recruitment_demand` 表

### POST `/api/v1/demands` — 创建需求

**请求体**:
```json
{
  "requestNo": "REQ-2026-001",
  "requesterName": "李四",
  "department": "技术部",
  "hiringManagerName": "王五",
  "priority": "high",
  "headcount": 3,
  "targetDate": "2026-09-30",
  "note": "紧急招聘"
}
```

> `priority`、`headcount`、`targetDate`、`note` 为可选字段。

**响应** (HTTP 201):
```json
{
  "code": 201,
  "data": { "id": 10 }
}
```

### GET `/api/v1/demands/{id}` — 需求详情

返回包含计算指标：
```json
{
  "code": 200,
  "data": {
    "id": 10,
    "requestNo": "REQ-2026-001",
    "requesterName": "李四",
    "department": "技术部",
    "hiringManagerName": "王五",
    "priority": "high",
    "headcount": 3,
    "targetDate": "2026-09-30",
	    "note": "紧急招聘",
	    "_demandMetrics": {
	      "daysSinceRequested": 0,
	      "daysUntilTarget": null,
	      "candidateInPipeline": 3,
	      "interviewCompletionRate": 0.67
	    },
	    "_riskFlags": {
	      "overdue": false,
	      "approachingDeadline": true,
	      "noProgress": false
	    }
  }
}
```

### PATCH `/api/v1/demands/{id}` — 更新需求

**请求体**（所有字段可选）:
```json
{
  "requestNo": "REQ-2026-001",
  "requesterName": "李四",
  "department": "技术部",
  "hiringManagerName": "王五",
  "priority": "high",
  "headcount": 3,
  "targetDate": "2026-09-30",
  "note": "更新备注",
  "jobId": 5
}
```

### POST `/api/v1/demands/{id}/close`

**请求体**:
```json
{
  "closeReason": "需求已满足"
}
```

### POST `/api/v1/demands/{id}/restore`

恢复需求，`status` 设置为 `open`。

### POST `/api/v1/demands/{id}/downgrade`

**请求体**:
```json
{
  "downgradeReason": "预算调整"
}
```

---

## 7. 面试管理

**Controller**: `com.hireinsight.interview.InterviewController` | 基础路径: `/api/v1/interviews`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/interviews/feedback` | 已认证 | 提交面试反馈 |
| POST | `/api/v1/interviews/schedule` | RECRUITER / MANAGER / ADMIN | 安排面试 |
| GET | `/api/v1/interviews` | 已认证 | 面试反馈列表 |
| GET | `/api/v1/interviews/{id}` | 已认证 | 面试反馈详情 |
| POST | `/api/v1/interviews/start` | RECRUITER / MANAGER / ADMIN | AI 面试开始 |
| POST | `/api/v1/interviews/submit` | INTERVIEWER / RECRUITER / MANAGER / ADMIN | 提交 AI 面试答案 |
| GET | `/api/v1/interviews/guide` | 已认证 | 面试指南（按轮次） |
| GET | `/api/v1/interviews/interviewers` | RECRUITER / MANAGER / ADMIN | 面试官列表（支持按姓名搜索） |
| GET | `/api/v1/interviews/assignments` | INTERVIEWER / RECRUITER / MANAGER / ADMIN | 面试任务分配 |
| POST | `/api/v1/interviews/assignments` | RECRUITER / MANAGER / ADMIN | 创建面试安排 |
| PUT | `/api/v1/interviews/assignments/{id}/status` | INTERVIEWER / RECRUITER / MANAGER / ADMIN | 更新面试安排状态 |
| GET | `/api/v1/interviews/assignments/by-interview/{interviewId}` | INTERVIEWER / RECRUITER / MANAGER / ADMIN | 按 interview 查询安排 |
| GET | `/api/v1/interviews/assignments/my` | INTERVIEWER / RECRUITER / MANAGER / ADMIN | 我的面试安排 |

> AI 面试评估现已基于 LLM（通过 LlmClient），LLM 不可用时自动降级为关键词规则评估。评分从 1-5 分（LLM 原生）或映射 0-100 分到 1-5 分。

### POST `/api/v1/interviews/feedback` — 提交面试反馈

**请求体**:
```json
{
  "candidateId": 12,
  "jobId": 3,
  "score": 4,
  "passRecommended": true,
  "qaJson": "{\"q\":\"问题\",\"a\":\"回答\"}",
  "aiReport": "AI 评估报告内容"
}
```

> `score` 取值范围: 1-5。`qaJson`、`aiReport` 为可选 JSON 字符串。`reasonTags`、`evaluationJson`、`passScore` 为新增字段。

### POST `/api/v1/interviews/schedule` — 安排面试

**请求体**:
```json
{
  "candidateId": 12,
  "jobId": 3,
  "interviewerId": 8
}
```

> 仅 `recruiter / manager / admin` 可操作。返回 `{id, status}` (status = `draft`)。

### POST `/api/v1/interviews/start` — AI 面试开始（LLM 生成题目）

**请求体**:
```json
{
  "jobId": 3,
  "candidateId": 12
}
```

**响应**:
```json
{
  "code": 201,
  "data": {
    "sessionId": 1,
    "session": { ... },
    "questions": [
      {
        "id": "q-1",
        "question": "请谈谈你在 Java 方面的项目经验？",
        "type": "technical",
        "expectedKeywords": "Java,Spring,项目经验",
        "maxScore": 25
      }
    ]
  }
}
```

> 题目由 LLM 根据职位描述（JD）动态生成，涵盖技术、行为、文化三个维度。LLM 不可用时自动降级为关键词模板生成。

### POST `/api/v1/interviews/submit` — 提交 AI 面试答案（LLM 评估）

**请求体**:
```json
{
  "sessionId": 1,
  "answers": [
    {
      "questionId": "q1",
      "question": "请描述一次解决复杂问题的经历",
      "answer": "在上一份工作中..."
    }
  ]
}
```

**响应**:
```json
{
  "code": 200,
  "data": {
    "sessionId": 1,
    "score": 4,
    "summary": "候选人表现良好，技术基础扎实。",
    "strengths": ["Java经验丰富", "沟通表达清晰"],
    "weaknesses": ["微服务经验稍显不足"],
    "passRecommended": true,
    "aiReport": "详细AI评估报告..."
  }
}
```

> `score` 为 1-5 分（LLM 评估结果）。`passRecommended` 基于平均分 >= 3.5 判定。LLM 不可用时降级为关键词匹配 + 回答长度评估。

### GET `/api/v1/interviews/guide`

返回按轮次划分的面试指南（v2.0），包含四轮：screening → technical → behavioral → final。每轮包含 focusAreas、sampleQuestions、riskFactors。

### GET `/api/v1/interviews`

**参数**: `?candidateId=12&jobId=3`

> `interviewer` 角色只能看到自己参与的面试记录。

### GET `/api/v1/interviews/interviewers`

**参数**: `?name=张`（可选，按姓名模糊搜索）

返回可选面试官列表 `[{id, name, email}, ...]`。支持按姓名搜索。

### GET `/api/v1/interviews/assignments`

> `interviewer` 角色只返回自己的面试任务分配。

### POST `/api/v1/interviews/assignments` — 创建面试安排

**请求体**:
```json
{
  "interviewId": 1,
  "round": 1,
  "interviewerId": 5,
  "interviewerName": "面试官姓名",
  "scheduledAt": "2026-07-15T14:00:00",
  "location": "会议室A",
  "notes": "首轮技术面试"
}
```

> `interviewerName`、`scheduledAt`、`location`、`notes` 为可选字段。`status` 默认为 `SCHEDULED`。

### PUT `/api/v1/interviews/assignments/{id}/status` — 更新面试安排状态

**请求体**:
```json
{
  "status": "COMPLETED",
  "notes": "面试已完成"
}
```

> `status` 可选值：`SCHEDULED` / `COMPLETED` / `CANCELLED`。`notes` 为可选字段。

### GET `/api/v1/interviews/assignments/by-interview/{interviewId}`

返回指定 interview 的所有安排记录（按轮次排序）。

### GET `/api/v1/interviews/assignments/my`

返回当前登录用户的面试安排。

---

## 8. Pipeline 流程管理

**Controller**: `com.hireinsight.pipeline.PipelineController` | 基础路径: `/api/v1/pipeline`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/pipeline/move` | 已认证 | 移动候选人到指定阶段 |
| GET | `/api/v1/pipeline` | 已认证 | 获取 pipeline 记录 |
| GET | `/api/v1/pipeline/{jobId}/board` | 已认证 | 岗位看板 |
| GET | `/api/v1/pipeline/{jobId}/candidates/{candidateId}/history` | 已认证 | 阶段变更历史 |
| POST | `/api/v1/pipeline/revise` | 已认证 | 修正候选人阶段 |
| GET | `/api/v1/pipeline/{jobId}/candidates/{candidateId}/rollback-preview` | 已认证 | 回退预览 |
| POST | `/api/v1/pipeline/{jobId}/candidates/{candidateId}/rollback` | 已认证 | 回退候选人 |
| GET | `/api/v1/pipeline/{jobId}/candidates/{candidateId}/offer` | 已认证 | 获取 Offer |
| PUT | `/api/v1/pipeline/{jobId}/candidates/{candidateId}/offer` | 已认证 | 保存/更新 Offer |

### 可用阶段
`pending` → `ai_screen` → `business_review` → `interview` → `offer` → `onboarded` / `rejected`

### POST `/api/v1/pipeline/move`

**请求体**:
```json
{
  "candidateId": 12,
  "jobId": 3,
  "toStage": "ai_screen"
}
```

### GET `/api/v1/pipeline/{jobId}/board`

返回看板视图（按阶段分组的候选人列表）：
```json
{
  "code": 200,
  "data": {
    "jobId": 3,
    "stages": {
      "pending": [{ "id": 12, "name": "张三" }],
      "ai_screen": [{ "id": 15, "name": "李四" }],
      "business_review": [],
      "interview": [{ "id": 18, "name": "王五" }],
      "offer": [],
      "onboarded": [],
      "rejected": [{ "id": 20, "name": "赵六" }]
    }
  }
}
```

### POST `/api/v1/pipeline/revise` — 修正

> 适用于 demo / legacy correction path，轻量纠偏。

**请求体**:
```json
{
  "toStage": "business_review",
  "candidateId": 12,
  "jobId": 3,
  "reason": "误操作纠正",
  "note": "应进入业务评审阶段"
}
```

### GET `/api/v1/pipeline/{jobId}/candidates/{candidateId}/rollback-preview`

```json
{
  "code": 200,
  "data": {
    "canRollback": true,
	    "currentStage": "interview",
	    "targetStage": "business_review",
	    "explanation": "可回退到业务评估阶段",
	    "history": [],
	    "reasonIfBlocked": ""
  }
}
```

### POST `/api/v1/pipeline/{jobId}/candidates/{candidateId}/rollback`

回退候选人到业务评估阶段（business_review）。

### PUT `/api/v1/pipeline/{jobId}/candidates/{candidateId}/offer`

**请求体**:
```json
{
  "salary": "25K-30K",
  "onboardDate": "2026-08-01",
  "notes": "候选人已通过终面"
}
```

> 当前 Offer 已持久化至 DB（OfferRecord 表），不包含完整审批流。

---

## 9. 简历上传

**Controller**: `com.hireinsight.resume.ResumeController` | 基础路径: `/api/v1/resumes`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/resumes/upload` | 已认证 | 上传简历文件（支持批量） |
| GET | `/api/v1/resumes/search` | 已认证 | 按技能标签搜索候选人 |
| GET | `/api/v1/resumes/{candidateId}/parse-status` | 已认证 | 查询解析状态 |
| POST | `/api/v1/resumes/{candidateId}/retry-parse` | 已认证 | 重新解析简历 |

### POST `/api/v1/resumes/upload`

> multipart/form-data，支持批量上传。

**参数**: 
- `files` — List of MultipartFile (必填)
- `source` — 来源标识，默认 `manual`（可选）
- `channel` — 渠道（可选）
- `notes` — 备注（可选）

**响应** (HTTP 202):
```json
{
  "code": 202,
  "data": {
    "queued": 2,
    "batchId": 1,
    "results": [
      { "file": "resume1.pdf", "candidateId": 101, "parseStatus": "processing" },
      { "file": "resume2.pdf", "candidateId": 102, "parseStatus": "processing" }
    ]
  }
}
```

> 上传后简历实时写入 PostgreSQL，异步 LLM 解析自动触发，`parseStatus` 为 `processing`。解析完成后候选人的 `resumeJson` 包含结构化字段（姓名/邮箱/电话/教育/经历/技能/技能评分1-5），并写入 `candidate_tag` 表支持按技能搜索。

### GET `/api/v1/resumes/search`

**参数**: `?skill=Java`（必填）

按技能标签搜索已解析的候选人。recruiter 只返回自己范围内的候选人；manager/admin 返回全部。

### GET `/api/v1/resumes/{candidateId}/parse-status`

查询指定候选人的解析状态。返回 `parseStatus`（pending/processing/ok/failed）和 `parseError`（失败时的错误信息）。

### POST `/api/v1/resumes/{candidateId}/retry-parse`

重新解析指定候选人的简历（清除之前的标签并重新执行异步解析）。只能操作本人负责的候选人（manager/admin 不受限）。

---

## 10. 商业智能 (BI)

**Controller**: `com.hireinsight.bi.BiController` | 基础路径: `/api/v1/bi`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/bi/overview` | 已认证 | 全局概览 |
| GET | `/api/v1/bi/staff/{hrId}` | MANAGER / ADMIN | HR 归因分析 |
| GET | `/api/v1/bi/job/{jobId}` | MANAGER / ADMIN | 岗位漏斗分析 |

> 当前为 rule-based JPA 聚合，非真实数仓。

### GET `/api/v1/bi/overview`

**响应**:
```json
{
  "code": 200,
  "data": {
    "activeJobs": 12,
    "candidateTotal": 345,
	    "parsedCandidates": 120,
	    "summary": [
	      { "key": "active_jobs", "label": "进行中岗位", "value": 12, "trend": "rule-based 聚合", "trendDirection": "neutral" },
	      { "key": "new_candidates", "label": "新增候选人", "value": 45, "trend": "up", "trendDirection": "up" },
	      { "key": "interviews_scheduled", "label": "安排面试", "value": 18, "trend": "up", "trendDirection": "up" },
	      { "key": "offers_pending", "label": "待发 Offer", "value": 3, "trend": "down", "trendDirection": "down" }
	    ]
  }
}
```

> recruiter 只看到自己 `owner_hr_id` 范围的数据；manager/admin 为全局范围（demo 阶段未按团队细分）。

### GET `/api/v1/bi/staff/{hrId}`

指定 HR 的招聘归因分析：阶段分布 / 推进统计。

### GET `/api/v1/bi/job/{jobId}`

指定岗位的漏斗分析：各阶段候选人数量 / 转化率。

---

## 11. Agent 与 AI 助手

**Controller**: `com.hireinsight.agent.AgentController` | 基础路径: `/api/v1/agent`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/agent/call-logs` | ADMIN only | 调用日志列表 |
| GET | `/api/v1/agent/call-logs/{id}` | ADMIN only | 调用日志详情 |
| GET | `/api/v1/agent/tools` | ADMIN only | 工具列表 |
| POST | `/api/v1/agent/execute` | ADMIN only | 执行工具 |
| GET | `/api/v1/agent/conversations` | 已认证 | 对话列表 |
| GET | `/api/v1/agent/conversations/{conversationId}` | 已认证 | 对话详情 |
| POST | `/api/v1/agent/conversations` | 已认证 | 创建对话 |
| PATCH | `/api/v1/agent/conversations/{conversationId}` | 已认证 | 更新对话 |
| DELETE | `/api/v1/agent/conversations/{conversationId}` | 已认证 | 删除对话 |
| POST | `/api/v1/agent/conversations/{conversationId}/messages` | 已认证 | 发送消息 |

> - 调用日志持久化: ✅ Flyway V12 — `agent_call_logs` 表
> - 会话数据: ✅ 持久化 (Flyway V16) - `conversations` / `conversation_messages` 表，重启不丢失
> - 写操作仅生成 confirm-first 确认卡，不真实执行

### GET `/api/v1/agent/call-logs`

**参数**: `?page=0&size=20&action=`

### POST `/api/v1/agent/execute`

**请求体**:
```json
{
  "toolName": "tool_example",
  "parameters": { "key": "value" }
}
```

> 当前为 mock 模式。

### POST `/api/v1/agent/conversations/{conversationId}/messages`

**请求体**:
```json
{
  "content": "帮我查看当前招聘进度"
}
```

> 当前返回 confirm-first 确认卡，不执行真实写操作。

---

## 12. 匹配

**Controller**: `com.hireinsight.match.MatchController` | 基础路径: `/api/v1/match`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/match` | 已认证 | 批量匹配候选人 |
| GET | `/api/v1/match/jobs/{jobId}/preview` | 已认证 | 匹配预览 |
| POST | `/api/v1/match/jobs/{jobId}/match` | 已认证 | 匹配并加入流程 |

> 数据为本地样例（demo 数据），算法已移植。

### POST `/api/v1/match` — 批量匹配

**请求体**:
```json
{
  "jobId": 3,
  "candidateIds": [12, 15, 18]
}
```

**响应**:
```json
{
  "code": 200,
  "data": [
    {
      "candidateId": 15,
      "candidateName": "李四",
      "score": 87.5,
      "matchedRequiredSkills": ["Java", "Spring Boot"],
      "matchedPreferredSkills": ["微服务", "Docker"],
      "missingRequiredSkills": ["Kubernetes"],
      "yearsOfExperience": 5,
      "summary": "良好匹配"
    }
  ]
}
```

### POST `/api/v1/match/jobs/{jobId}/match`

**请求体**:
```json
{
  "candidateIds": [12, 15]
}
```

匹配后自动将候选人加入 pipeline，初始阶段为 `ai_screen`。

---

## 13. BOSS 直聘 Demo Stub

**Controller**: `com.hireinsight.boss.BossController` | 基础路径: `/api/v1/boss`

> ⚠️ **所有端点为 Demo Stub** — 返回 in-memory 静态样例数据，不连接真实 BOSS 直聘。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/boss/status` | 已认证 | 状态查询 |
| POST | `/api/v1/boss/login` | 已认证 | 登录 |
| POST | `/api/v1/boss/browser-cookie` | 已认证 | 导入浏览器 Cookie |
| GET | `/api/v1/boss/jobs` | 已认证 | 岗位列表 |
| GET | `/api/v1/boss/candidates/recommend` | 已认证 | 推荐候选人 |
| GET | `/api/v1/boss/candidates/inbox` | 已认证 | 收件箱候选人 |
| GET | `/api/v1/boss/candidates/{id}/resume` | 已认证 | 候选人简历 |
| GET | `/api/v1/boss/resume/download` | 已认证 | 简历下载 |
| POST | `/api/v1/boss/batch-import` | 已认证 | 批量导入 |
| POST | `/api/v1/boss/ai-screen` | 已认证 | AI 筛选 |
| GET | `/api/v1/boss/accounts` | 已认证 | 账号列表 |
| POST | `/api/v1/boss/accounts/activate` | 已认证 | 激活账号 |
| DELETE | `/api/v1/boss/accounts/{id}` | 已认证 | 删除账号 |
| POST | `/api/v1/boss/accounts/verify` | 已认证 | 验证账号 |
| GET | `/api/v1/boss/labels` | 已认证 | 标签列表 |
| POST | `/api/v1/boss/chat` | 已认证 | 发送消息 |
| GET | `/api/v1/boss/export` | 已认证 | 数据导出 |
| GET | `/api/v1/boss/extension/download` | 已认证 | 扩展下载 |

> 当前集成壳层为非真实第三方授权，不代表已完成在线授权。

---

## 14. 通知中心

**Controller**: `com.hireinsight.notifications.NotificationController` | 基础路径: `/api/v1/notifications`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/notifications` | 已认证 | 通知列表（分页） |
| GET | `/api/v1/notifications/unread-count` | 已认证 | 未读通知数 |
| PUT | `/api/v1/notifications/{id}/read` | 已认证 | 标记单条已读 |
| PUT | `/api/v1/notifications/read-all` | 已认证 | 全部标记已读 |

> 数据持久化至 DB（PostgreSQL），重启不丢失。

### GET `/api/v1/notifications`（分页）

**查询参数**: `page=0`（默认）、`per_page=20`（默认）

**响应**:
```json
{
  "code": 200,
  "data": {
    "notifications": [
      {
        "id": 1,
        "type": "system",
        "title": "新候选人待处理",
        "body": "有 3 位候选人等待初筛",
        "link": null,
        "is_read": false,
        "created_at": "2026-07-08T10:00:00"
      }
    ],
    "total": 1,
    "page": 0,
    "per_page": 20,
    "pages": 1,
    "unread_count": 1
  }
}
```

### GET `/api/v1/notifications/unread-count`

```json
{
  "code": 200,
  "data": { "count": 3 }
}
```

### PUT `/api/v1/notifications/{id}/read`

```json
{
  "code": 200,
  "data": { "id": 1, "is_read": true }
}
```

### PUT `/api/v1/notifications/read-all`

```json
{
  "code": 200,
  "data": { "status": "all marked read" }
}
```

---

## 15. 系统治理

**Controller**: `com.hireinsight.admin.SystemGovernanceController` | 基础路径: `/api/v1/admin/system`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/system/overview` | ADMIN only | 系统治理概览 |
| GET | `/api/v1/admin/system/audit-logs` | ADMIN only | 审计日志 |
| POST | `/api/v1/admin/system/parameters/{key}/toggle` | ADMIN only | 切换系统参数 |
| POST | `/api/v1/admin/system/models/{modelId}/toggle-status` | ADMIN only | 切换模型状态 |

> 治理数据为 in-memory demo。

### POST `/api/v1/admin/system/parameters/{key}/toggle`

仅支持 `audit.manualReviewEnabled`。

### POST `/api/v1/admin/system/models/{modelId}/toggle-status`

仅支持 `interview-question-generator`。

---

## 16. 管理员用户治理

**Controller**: `com.zhiping.rebuild.user.AdminUserController` | 基础路径: `/api/v1/admin/users`

> 类级别 `@PreAuthorize("hasRole('ADMIN')")`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/v1/admin/users` | ADMIN only | 创建用户 |
| PATCH | `/api/v1/admin/users/{userId}` | ADMIN only | 更新用户 |
| POST | `/api/v1/admin/users/{userId}/reset-password` | ADMIN only | 重置密码 |

### POST `/api/v1/admin/users`

**请求体**:
```json
{
  "name": "新用户",
  "email": "newuser@hireinsight.local",
  "role": "recruiter",
  "password": "temporaryPwd123",
  "active": true
}
```

**响应** (HTTP 201):
```json
{
  "code": 201,
  "data": {
    "id": 20,
    "name": "新用户",
    "email": "newuser@hireinsight.local",
    "role": "recruiter",
    "active": true,
    "createdAt": "2026-07-08T10:00:00Z"
  }
}
```

### PATCH `/api/v1/admin/users/{userId}`

**请求体**:
```json
{
  "name": "更新后的名字",
  "role": "manager",
  "active": true
}
```

> 所有字段可选。

### POST `/api/v1/admin/users/{userId}/reset-password`

**请求体**:
```json
{
  "newPassword": "newSecurePwd456"
}
```

---

## 17. 人才地图

**Controller**: `com.zhiping.rebuild.talentmap.TalentMapController` | 基础路径: `/api/v1/talent-maps`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/talent-maps` | 已认证 | 人才地图列表 |
| POST | `/api/v1/talent-maps` | 已认证 | 创建人才地图 |
| GET | `/api/v1/talent-maps/{mapId}` | 已认证 | 人才地图详情 |
| POST | `/api/v1/talent-maps/{mapId}/companies` | 已认证 | 添加公司 |
| POST | `/api/v1/talent-maps/{mapId}/people` | 已认证 | 添加人员 |
| PATCH | `/api/v1/talent-maps/{mapId}` | 已认证 | 更新地图 |
| PATCH | `/api/v1/talent-maps/{mapId}/companies/{companyId}` | 已认证 | 更新公司 |
| PATCH | `/api/v1/talent-maps/{mapId}/people/{personId}` | 已认证 | 更新人员 |

### POST `/api/v1/talent-maps` — 创建

**请求体**:
```json
{
  "name": "竞品公司人才地图",
  "jobId": 3,
  "department": "技术部",
  "boardJson": "{}"
}
```

### GET `/api/v1/talent-maps/{mapId}` — 详情

**参数**: `?company=&city=&status=&keyword=`（全部可选）

**响应**:
```json
{
  "code": 200,
  "data": {
    "id": 1,
    "name": "竞品公司人才地图",
    "jobId": 3,
    "jobTitle": "高级 Java 工程师",
    "department": "技术部",
    "ownerHrId": 1,
    "boardJson": "{}",
    "companiesCount": 5,
    "peopleCount": 12,
    "companies": [...],
    "people": [...],
    "createdAt": "2026-07-08T10:00:00Z",
    "updatedAt": "2026-07-08T10:00:00Z"
  }
}
```

### POST `/api/v1/talent-maps/{mapId}/companies`

**请求体**:
```json
{
  "companyName": "某科技有限公司",
  "city": "北京",
  "region": "海淀区",
  "industry": "互联网",
  "priority": "high",
  "note": "重点竞品"
}
```

### POST `/api/v1/talent-maps/{mapId}/people`

**请求体**:
```json
{
  "companyId": 1,
  "name": "张三",
  "title": "技术总监",
  "city": "北京",
  "tags": ["Java", "架构", "管理"],
  "salaryRange": "50K-70K",
  "contactStatus": "interested",
  "evaluation": "A+",
  "source": "linkedin",
  "nextFollowAt": "2026-08-01",
  "note": "重点跟进"
}
```

---

## 汇总统计

### 接口数统计

| 模块 | Controller | 接口数 | 主要实体 | 持久化状态 |
|------|-----------|--------|---------|-----------|
| 健康检查 | `HealthController` | 1 | - | — |
| 认证 | `AuthController` | 3 | User | ✅ JPA |
| 用户管理 | `UserController` | 3 | User | ✅ JPA |
| 岗位管理 | `JobController` | 6 | Job | ✅ JPA |
| 候选人管理 | `CandidateController` | 6 | Candidate | ✅ JPA |
| 招聘需求 | `DemandController` | 7 | RecruitmentDemand | ✅ Flyway V10 |
| 面试管理 | `InterviewController` | 14 | InterviewFeedback, InterviewSession, InterviewAssignment | ✅ 实体 + ✅ LLM 评估(LLM/降级规则) |
| 流程管理 | `PipelineController` | 9 | PipelineStage | ✅ JPA |
| 简历上传与解析 | `ResumeController` | 4 | Candidate, UploadBatch, CandidateTag | ✅ JPA + ✅ Flyway V13 |
| 商业智能 | `BiController` | 3 | - | ⚡ JPA 聚合 (rule-based) |
| Agent / AI 助手 | `AgentController` | 10 | AgentCallLog, Conversation | ✅ 调用日志 + ✅ 会话(持久化 Flyway V16) |
| 匹配 | `MatchController` | 3 | - | ❌ demo 数据 |
| BOSS 直聘 | `BossController` | 18 | - | ⚡ real CLI mode (默认 demo) |
| 通知中心 | `NotificationController` | 4 | Notification | ✅ JPA (Flyway V14) |
| 审计日志 | `AuditLogController` | 1 | AuditLog | ✅ JPA (Flyway V14) |
| 候选人处置 | `DispositionController` | 2 | CandidateDisposition | ✅ JPA (Flyway V14) |
| 系统治理 | `SystemGovernanceController` | 4 | - | ❌ in-memory (demo) |
| 管理员用户治理 | `AdminUserController` | 3 | User | ✅ JPA |
| 人才地图 | `TalentMapController` | 8 | TalentMap, Company, Person | ✅ JPA |
| **合计** | **17** | **105** | | |

### HTTP 方法分布

| 方法 | 数量 |
|------|------|
| GET | 57 |
| POST | 32 |
| PUT | 4 |
| PATCH | 10 |
| DELETE | 2 |
| **总计** | **105** |

### 权限分布

| 权限级别 | 数量 |
|---------|------|
| 公开 (无限制) | 2 |
| 已认证 (任意角色) | 61 |
| ADMIN only | 14 |
| RECRUITER / MANAGER / ADMIN | 4 |
| 多角色 (含 INTERVIEWER) | 2 |
| 角色检查 (手动代码) | 14 |

### 边界标注

| 类型 | 模块 | 说明 |
|------|------|------|
| **Demo-Stub** | BOSS 直聘 | 默认 demo 返回 in-memory 静态样例数据；已支持真实 CLI 子进程模式（需配置 BOSS CLI） |
| **Demo 数据** | 匹配 | 算法已移植，数据为本地样例 |
| **Rule-Based** | BI | JPA 聚合，非真实数仓；概览按角色范围区分 |
| **持久化** | Agent 会话 | 会话与消息持久化到数据库（Flyway V16），重启不丢 |
| **LLM + 降级** | AI 面试评估 | LLM 驱动评估与出题，LLM 不可用时降级为 rule-based |
| **LLM 解析** | 简历解析 | 简历上传后写入数据库，解析使用 LLM 结构化抽取（无 API key 时降级为 mock 占位） |
