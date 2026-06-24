# 炫技前端优化方案（GSAP · 克制精致档）

## 目标
用 GSAP 为「智聘」前端注入丰富但克制精致的动效，新增角色化「工作台」首页解决布局松散/功能显少的问题，让各角色清晰可见、有指引感。强度档位：**克制精致**（Cal.com 单色基调下的高级感，非花哨）。工作台设为登录后默认首页。

## 一、GSAP 基建
- 安装 `gsap` + `@gsap/react`（useGSAP hook，自动清理）
- 新建 `src/lib/motion.ts`：统一缓动/时长常量；用 `gsap.matchMedia` 处理 `prefers-reduced-motion`（无障碍）；注册 useGSAP/插件
- 新建复用件：
  - `src/components/motion/Reveal.tsx`：进场容器（淡入+上浮，支持 stagger 子元素）
  - `src/components/motion/AnimatedNumber.tsx`：KPI 数字滚动递增
  - `src/lib/useReveal.ts`（可选）：列表 stagger 进场 hook

## 二、工作台首页 DashboardPage（路由 `/`，默认落地）
- 角色欢迎横幅：当前角色（招聘专员/经理/管理员/面试官）+ 职责说明，标题淡入
- KPI 统计卡：候选人/岗位/面试/入职数字滚动 + stagger 进场（复用 biOverview / listCandidates / listJobs）
- 功能入口宫格：把侧边栏功能拆成主页大卡片（图标+hover 浮起+点击进入），按角色显示，填充空旷布局、强化指引
- 角色相关快捷操作/引导卡

## 三、全站动效注入（克制精致）
- 登录页：Logo back.out 弹入、表单 stagger 上浮、按钮交互反馈
- AppShell 侧边栏：导航项 stagger 进场、active 滑动指示、hover 微交互；底部新增角色身份卡（头像+姓名+角色徽章+职责）
- 路由切换：统一进场过渡（升级现有 fadeIn）
- 列表/卡片：stagger 级联进场 + hover 浮起
- BI 看板：KPI 数字滚动、图表/漏斗条依次展开
- Agent 页：工具卡片弹入、思考脉冲增强

## 四、角色清晰化
- 4 角色图标/配色区分（Cal.com 单色内克制点缀）
- 侧边栏角色身份卡 + Dashboard 顶部角色横幅
- ROLE 职责文案集中定义

## 五、约束与纪律
- 保持 Cal.com 近黑单色语言；尊重 prefers-reduced-motion
- 所有 GSAP 用 useGSAP + scope ref，自动清理无泄漏
- 不破坏现有功能；新增路由 `/`→Dashboard，nav 加「工作台」
- 主要新建：motion.ts、DashboardPage.tsx、motion 组件；改造：AppShell、LoginPage、App.tsx、nav.ts、各页注入进场

## 执行与验证
- subagent 并行：① 基建+Dashboard ② 各页面动效注入；我负责 AppShell/登录/路由核心 + 验收
- 每步 `npm run typecheck && npm run build && npm run lint` 全绿
- 前端 :5173 实测：动效运行、无控制台报错、各角色登录展示正确
