# 前端彻底重构方案 — Cal.com 设计语言 + 企业级 HR 定位

## 目标
依据 `DESIGN.md`(Cal.com 设计语言)彻底重构 HireInsight 前端,所有视觉细节符合设计文档;强化产品定位为「企业级 HR/管理者工具」,清除一切「应聘者作为用户」的视角;界面语言全面统一为中文。

## 已确认决策
1. **布局骨架**:保留「左侧边栏 + 顶栏」的后台应用结构(app.cal.com 也是侧边栏),但所有视觉令牌严格改为 Cal.com 风格。
2. **界面语言**:全面统一为中文(登录页、导航标签、角色名、按钮、提示)。
3. **导航命名**:`/interviews` 的「My Performance」→「AI 面试」。

## Cal.com 设计令牌(目标视觉)
- **主色**:近黑 `#111111`(primary),按下态 `#242424`。蓝色 `#3b82f6` 仅用于极少数内联链接/高亮,**绝不用于主按钮**。
- **画布**:白 `#ffffff`;软表面 `#f8f9fa`;卡片浅灰 `#f5f5f5`;强表面/禁用 `#e5e7eb`;深色面 `#101010`(仅页脚/反色卡片)。
- **文字**:墨黑 `#111111`(标题)、正文 `#374151`、次要 `#6b7280`、三级 `#898989`。
- **发丝线**:`#e5e7eb`(边框)、`#f3f4f6`(极淡分隔)。
- **语义色**:success `#10b981`、warning `#f59e0b`、error `#ef4444`。
- **徽章彩**:orange `#fb923c`、pink `#ec4899`、violet `#8b5cf6`、emerald `#34d399`(仅头像/小标签点缀)。
- **字体**:Inter(全局),展示标题 Inter 600 + 负字距(-0.04em / -0.5~-2px),正文 Inter 400。等宽 JetBrains Mono(可选,代码/数字)。
- **圆角**:按钮/输入框 8px(md),卡片 12px(lg),大卡片 16px(xl),胶囊/徽章 9999px(pill),头像/圆形按钮 full。
- **阴影**:极轻。`0 1px 2px rgba(0,0,0,0.05)` 与 `0 4px 12px rgba(0,0,0,0.08)`。无重阴影。
- **间距节奏**:卡片内边距 24~32px;区块间距大方留白。

---

## 实施步骤

### 阶段 A:设计令牌地基(基础设施层)
**A1. `tailwind.config.js` 重建颜色 + 字体 + 圆角 + 阴影令牌**
- 新增语义化颜色:`ink`/`body`/`muted`/`muted-soft`、`canvas`/`surface-soft`/`surface-card`/`surface-strong`/`surface-dark`/`surface-dark-elevated`、`hairline`/`hairline-soft`、`on-primary`/`on-dark`/`on-dark-soft`、`brand-accent`、`badge-*`。
- **保留** `success`/`warning`/`danger` 三色(已与文档语义色 #10b981/#f59e0b/#ef4444 一致,补齐色阶)。
- **关键策略**:`brand` 色阶**重映射为近黑灰阶**(brand-50→#f5f5f5 … brand-600→#111111、brand-700→#242424),这样现有代码里大量 `bg-brand-600`/`text-brand-700`/`bg-brand-50` 类名**无需逐一改写**就能立刻变成「近黑主色 + 浅灰激活态」的 Cal.com 观感。同时把 `gray` 色阶微调为文档的中性灰(gray-50→#f8f9fa…gray-900→#111111)。这是把「替换 token 定义」作为主杠杆、把「逐文件改类名」作为精修的混合策略,降低风险、保证全站一致。
- `fontFamily.sans` 改为 `['Inter', 'system-ui', ...]`;新增 `fontFamily.mono`。
- `borderRadius` 增加 `xl:16px`(lg 已是 12px 由 Tailwind 默认 0.5rem=8px → 需显式设 lg:12px)。
- `boxShadow.card` 调为 `0 1px 2px rgba(0,0,0,0.05)`,`card-hover` 调为 `0 4px 12px rgba(0,0,0,0.08)`。
- 新增 `letterSpacing.display: -0.02em` 等,供展示标题用。

**A2. `index.html` 引入 Inter 字体**
- `<link>` 引入 Google Fonts Inter(400/500/600/700)。带 preconnect。

**A3. `index.css` 调整**
- `body` 背景改为 `canvas`(白)而非 gray-50(文档:白画布是默认地板;app 内容区可用 surface-soft 极淡灰)。实际:body 用白,主内容区 `bg-surface-soft`。
- 滚动条颜色改为中性灰(hairline 系)。
- 新增展示标题工具类 `.font-display`(Inter 600 + 负字距)。

### 阶段 B:UI primitives 重构(组件层)
**B1. `Button.tsx`** — primary 改为近黑 `bg-ink`(或经 brand 重映射后的 `bg-brand-600`=#111111)、hover `#242424`;secondary 白底发丝边框;ghost 透明;danger 保留。圆角 8px,高度 40px(md)/32px(sm)。focus ring 改中性色。
**B2. `Card.tsx`** — 边框 hairline,圆角 12px,阴影极轻。提供「浅灰卡片」(surface-card)与「白卡片带发丝边」两种用法。
**B3. `Badge.tsx`** — pill 胶囊,caption 字号;tone 调色对齐文档(neutral=surface-card/ink,success/warning/danger 用语义色浅底)。
**B4. `Input.tsx`** — 白底,hairline 边框,focus 边框转墨黑(`text-input-focused`),圆角 8px,高 40px。
**B5. `Spinner.tsx`** — 颜色继承(基本不变)。
- 新增(可选)`SegmentedControl`(nav-pill-group 胶囊切换组)供 BI 时间范围、Pipeline 等复用 —— 文档的签名组件。

### 阶段 C:布局与导航(骨架层)
**C1. `lib/nav.ts`** — 标签全部中文化:候选人 / 简历上传 / 岗位 / 招聘流程 / AI 面试 / 数据看板。`ROLE` 默认路由不变。
**C2. `AppShell.tsx`** — 侧边栏白底 + 发丝右边框;Logo 方块改近黑(非 brand 蓝);激活态 nav = 浅灰底 + 墨黑字;顶栏发丝下边框;角色 Badge 中文;退出按钮中文「退出登录」。整体留白对齐文档节奏。
**C3. 角色名中文映射**:`ROLE_LABELS` → 招聘专员/经理/管理员/面试官(AppShell、LoginPage、BiPage 等处统一)。

### 阶段 D:页面逐个重构(11 个页面)
对每个页面:① 套用新令牌观感 ② 中文化所有文案 ③ 清除/修正任何应聘者视角措辞 ④ 对齐 Cal.com 卡片/表格/留白细节。

**D1. `LoginPage.tsx`** — 全中文(登录工作台/创建账户、邮箱、密码、角色选择);Logo 近黑;主按钮近黑;**明确企业定位**(如副标题「企业招聘管理平台 · 仅限内部员工」),无任何应聘者入口。
**D2. `CandidatesPage.tsx`** — 标题「候选人」;表格发丝分隔;空状态中文;快捷上传按钮近黑。
**D3. `CandidateProfilePage.tsx`** — 面包屑中文;雷达图/技能条配色改中性+语义色(recharts 用 hex,映射到新令牌);结构化简历卡片浅灰。
**D4. `UploadPage.tsx`** — 「简历上传」;拖拽区发丝虚线 + hover 近黑;文案确认为 HR 视角(已是);结果 Badge 语义色。
**D5. `JobsPage.tsx`** — 「岗位管理」;新建表单卡片;AI 解析结果展示;列表表格;按钮「新建岗位」。
**D6. `JobMatchPage.tsx`** — 「岗位匹配」;排名表格;匹配/欠缺标签用 success/muted;分数用近黑强调。
**D7. `PipelinePage.tsx`** — 「招聘流程」;6 列看板配色改 Cal.com(列头浅灰/发丝,计数近黑);推进面板;诚实计数板不变。
**D8. `InterviewsPage.tsx`** — 「AI 面试」;3 阶段步骤指示器配色;**强化 HR 视角文案**:把「请模拟填写候选人回答」「请输入候选人回答」改为更明确的 HR 录入措辞(如「录入候选人作答(用于 AI 评估)」),消除「候选人本人在此作答」的歧义;报告区配色。
**D9. `InterviewReportPage.tsx`** + **`components/InterviewReport.tsx`** — 报告卡片中文化;评分/通过建议 Badge 语义色;逐题亮点(success)/疑点(warning)。
**D10. `BiPage.tsx`** — 「数据看板」;KPI 卡浅灰;recharts 漏斗/柱状改中性+语义 hex 配色(映射新令牌:主柱近黑/灰阶,语义点缀);时间范围切换器改用 nav-pill-group 胶囊样式;专员对比表;钻取层;团队均值高/低着色保留(改用 success/danger 语义色)。
**D11. 清理** — 删除废弃 `stubs.tsx`(已无路由引用)与 `PageStub.tsx`(若无引用);移除未使用 token。

### 阶段 E:验收
- `cd frontend && npm run typecheck && npm run build && npm run lint` 全绿。
- 人工核对:无英文残留(界面)、无应聘者视角文案、配色统一近黑+白+浅灰。
- 不改后端、不改 api.ts 契约、不改业务逻辑(纯样式 + 文案 + 令牌)。

---

## 执行方式
采用「令牌定义重映射(主杠杆)+ 组件/页面精修」混合策略,通过子 agent 分组并行重构(基础设施 → primitives/布局 → 页面分批),每组完成后跑构建门禁,最后整体复审。不改 git(非仓库)。

## 风险与缓解
- **风险**:`brand-*` 重映射后,某些原本依赖「蓝色」语义的地方(如选中态)视觉变化大 → 缓解:重映射为浅灰/近黑后逐页核对激活态可读性。
- **风险**:recharts 硬编码 hex 颜色不随 token 变 → 缓解:D3/D10 单独把图表配色改为新令牌对应 hex。
- **风险**:中文化遗漏 → 缓解:阶段 E 全站 grep 英文界面文案核对。
- **回归保障**:每阶段跑 typecheck+build+lint;api 契约与业务逻辑零改动。
