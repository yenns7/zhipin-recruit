# 17 · Java + React 真实试点前落地准备清单

> 日期：2026-07-07
> 适用范围：`rebuild/` Java Spring Boot + React 重构版
> 使用对象：试点负责人、运维/研发、HR 试点管理员
> 当前结论：本清单完成后，可以发给真实用户做**小范围试点准备**；仍不是生产上线。

## 0. 试点红线

- 不使用 `dev` profile 承载真实数据。
- 不使用 `demo.*@hireinsight.local` 或固定 demo 密码录入真实简历。
- 不把真实 `.env`、JWT 密钥、数据库密码截图或发到群里。
- 不在没有备份的情况下批量导入、批量删除、恢复数据库或替换上传目录。
- 不把 `/tmp` 作为上传目录。
- 不把 AI 助手、系统设置里的系统治理、通知待办包装成生产级自动化能力；当前仍有 demo / in-memory 边界。

## 1. 目标服务器部署步骤清单

### 1.1 服务器基础准备

负责人：运维/研发

- [ ] 准备 Linux 服务器或内网主机，并确认可访问公司试点域名。
- [ ] 安装 JDK 21、Maven 3.9+、Node.js/npm、PostgreSQL 客户端工具、Nginx。
- [ ] 确认 `java -version`、`mvn -version`、`node -v`、`npm -v`、`pg_dump --version`、`pg_restore --version` 可用。
- [ ] 创建应用目录，例如 `/srv/hireinsight`。
- [ ] 创建环境变量文件目录，例如 `/etc/hireinsight`，权限设为仅运维/服务账号可读。
- [ ] 创建日志目录，例如 `/var/log/hireinsight`。

### 1.2 PostgreSQL

负责人：运维/DBA/研发

- [ ] 创建真实试点数据库，例如 `hireinsight`。
- [ ] 创建应用账号，例如 `hireinsight_app`，使用强密码。
- [ ] 授权应用账号访问目标数据库和 schema。
- [ ] 准备表结构：`pilot` profile 使用 `ddl-auto=validate`，不会自动建表；空库必须先导入已验收 schema，或由研发负责人在空库完成受控建表后再切到 `pilot`。
- [ ] 明确真实数据不能被 seed/reset 覆盖；任何 seed/reset 只能在本地或空测试库执行。
- [ ] 记录数据库连接信息，但不要把密码写入代码仓库。

验收：

```bash
psql "postgresql://hireinsight_app:<密码>@127.0.0.1:5432/hireinsight" -c "select 1;"
```

### 1.3 上传目录和备份目录

负责人：运维

- [ ] 创建上传目录，例如 `/srv/hireinsight/uploads`。
- [ ] 创建备份目录，例如 `/srv/hireinsight/backups`。
- [ ] 确认后端运行用户对上传目录有读写权限。
- [ ] 确认备份脚本运行用户对备份目录有写入权限。
- [ ] 确认上传目录和备份目录都在持久磁盘上，不在 `/tmp`。

验收：

```bash
test -d /srv/hireinsight/uploads
test -d /srv/hireinsight/backups
test -w /srv/hireinsight/uploads
test -w /srv/hireinsight/backups
```

### 1.4 前端 build 和 Nginx

负责人：研发/运维

```bash
cd /srv/hireinsight/frontend
npm ci
npm run build
```

Nginx 推荐托管 `dist`：

```nginx
server {
    listen 443 ssl;
    server_name hr-pilot.example.com;

    root /srv/hireinsight/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

验收：

- [ ] 访问 `https://hr-pilot.example.com` 能打开登录页。
- [ ] 刷新任意前端路由不会 404。
- [ ] 浏览器 Network 中 `/api/` 请求转发到 Java 后端，不再请求本地开发端口 `5173`。

### 1.5 Java 后端 pilot profile

负责人：研发/运维

环境变量文件：

```bash
cp /srv/hireinsight/rebuild/backend-java/.env.pilot.example /etc/hireinsight/hireinsight-pilot.env
chmod 600 /etc/hireinsight/hireinsight-pilot.env
```

构建和基础校验：

```bash
cd /srv/hireinsight/rebuild/backend-java
mvn test
```

systemd 示例：

```ini
[Unit]
Description=HireInsight Java Rebuild API
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/hireinsight/rebuild/backend-java
EnvironmentFile=/etc/hireinsight/hireinsight-pilot.env
ExecStart=/usr/bin/mvn spring-boot:run -Dspring-boot.run.profiles=pilot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable hireinsight
sudo systemctl start hireinsight
sudo journalctl -u hireinsight -f
```

验收：

- [ ] 后端日志没有 `Pilot readiness check failed`。
- [ ] 后端监听 `127.0.0.1:8080` 或约定内网端口。
- [ ] 服务重启后账号、岗位、候选人、流程、面试反馈仍在 PostgreSQL 中。

### 1.6 健康检查

负责人：运维/试点负责人

```bash
curl -fsS https://hr-pilot.example.com/api/v1/health
```

通过标准：

```json
{
  "data": {
    "status": "UP",
    "database": "UP",
    "service": "hireinsight-api"
  }
}
```

如果返回 `503` 或 `database=DOWN`，先修数据库连接，不开放试点。

## 2. 真实环境变量检查清单

环境变量文件建议放在 `/etc/hireinsight/hireinsight-pilot.env`，权限 `600`。真实值不要提交到 git。

| 变量 | 怎么配置 | 验收方式 | 不通过时的处理 |
|---|---|---|---|
| `SPRING_PROFILES_ACTIVE` | 固定为 `pilot` | 后端日志显示 active profile 为 `pilot` | 不是 `pilot` 不开放真实试点 |
| `SERVER_PORT` | 默认 `8080`，与 Nginx 反代一致 | `lsof -i :8080` 或健康检查通过 | 改 Nginx 或后端端口保持一致 |
| `JWT_SECRET` | 用 `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` 生成，至少 32 字符 | `pilot` 启动不报弱密钥；旧 token 失效 | 立刻替换，重启后端 |
| `JWT_EXPIRY_HOURS` | 建议 `8` | 登录后能正常使用，过期后重新登录 | 试点期不建议过长 |
| `DATABASE_URL` | `jdbc:postgresql://127.0.0.1:5432/hireinsight`，不要写本地 demo 库 | `/api/v1/health` 中 `database=UP` | 修连接地址、网络、库名 |
| `DATABASE_USER` | 独立应用账号，例如 `hireinsight_app` | 后端能启动，PostgreSQL 日志无鉴权失败 | 修账号授权 |
| `DATABASE_PASSWORD` | 强密码，不能是 `hipass` | `pilot` 启动不报 demo 密码 | 立刻替换数据库密码和 env |
| `PUBLIC_REGISTRATION_ENABLED` | 固定 `false` | 注册接口不可公开创建账号 | 改为 `false` 并重启 |
| `CORS_ALLOWED_ORIGINS` | 真实前端域名，例如 `https://hr-pilot.example.com`，不能是 `*` | 非白名单来源浏览器请求被拒；正式域名可用 | 收紧到试点域名 |
| `UPLOAD_FOLDER` | 持久目录，例如 `/srv/hireinsight/uploads` | 上传简历后文件仍在该目录；重启不丢 | 改目录权限或路径 |
| `BACKUP_DIR` | 持久目录，例如 `/srv/hireinsight/backups` | `backup_pilot_data.py --dry-run` 输出该目录 | 改目录权限或路径 |
| `LOGGING_FILE_NAME` | 例如 `/var/log/hireinsight/backend.log` | 文件存在且服务账号可写 | 修日志目录权限 |
| `PILOT_BOOTSTRAP_ADMIN_EMAIL` | 只在首次创建管理员时临时配置 | 首次管理员能登录 | 创建正式管理员后删除该变量 |
| `PILOT_BOOTSTRAP_ADMIN_PASSWORD` | 一次性强密码，只用于首次登录 | 首次管理员能登录 | 创建正式管理员后删除该变量并重启 |

说明：

- Java rebuild 当前没有字段级加密实现，不要配置一个 `FIELD_ENCRYPTION_KEY` 后对外宣称字段级加密已经生效。
- `PILOT_BOOTSTRAP_ADMIN_EMAIL/PASSWORD` 是初始化入口，不是长期账号密码管理方案。
- 环境变量改完后必须重启后端，再跑健康检查和四角色冒烟。

## 3. 试点账号方案

### 3.1 账号分层

| 账号类型 | 建议数量 | 用途 | 是否保留 |
|---|---:|---|---|
| Bootstrap 初始化管理员 | 1 | 首次进系统，创建正式管理员和试点账号 | 不建议长期保留；若使用独立 bootstrap 邮箱，创建正式账号后禁用 |
| 正式管理员 | 1-2 | 用户创建/启停/重置密码、系统设置查看、权限边界验证 | 保留，必须实名到人 |
| 招聘专员 | 1-3 | 上传简历、维护候选人、加入流程、推进、安排面试 | 保留，必须一人一号 |
| 招聘经理/负责人 | 1-2 | 看团队看板、岗位进展、归属、绩效和流程卡点 | 保留，必须一人一号 |
| 面试官 | 1-3 | 查看自己的面试、候选人材料、填写反馈 | 保留，必须一人一号 |
| demo 账号 | 0 | 仅本地演示 | 不能保留在真实试点库 |
| 共享账号 | 0 | 无 | 不能使用 |

### 3.2 推荐创建顺序

1. 运维临时配置 bootstrap 管理员环境变量。
2. 启动后端，确认 bootstrap 管理员能登录。
3. Bootstrap 管理员创建正式管理员账号。
4. 正式管理员登录，重置或禁用 bootstrap 账号。
5. 运维删除 `PILOT_BOOTSTRAP_ADMIN_EMAIL/PASSWORD` 并重启后端。
6. 正式管理员创建招聘专员、负责人、面试官账号。
7. 每个试点人员首次登录后，由管理员确认账号角色和启用状态。

### 3.3 不能保留的账号和凭据

- `demo.recruiter@hireinsight.local`
- `demo.manager@hireinsight.local`
- `demo.interviewer@hireinsight.local`
- `demo.admin@hireinsight.local`
- `demo@hireinsight.local`
- `admin01@mvp.local`
- `manager01@mvp.local`
- `lead01@mvp.local`
- `hr01@mvp.local`
- `hr02@mvp.local`
- `hr03@mvp.local`
- `interviewer01@mvp.local`
- 任何使用 `HireInsight2026`、`Zhipin2026`、`hipass`、`admin123`、`password` 这类固定演示密码或弱密码的账号
- 任何发到群里、截图流转、多人共用的账号
- 留在服务器环境变量里的 bootstrap 明文密码

## 4. 四角色冒烟验收表

冒烟验收必须在目标服务器、真实试点域名、`pilot` profile 下完成。每一步都记录：账号、时间、页面、结果、截图。

### 4.1 管理员

| # | 关键动作 | 成功标准 |
|---|---|---|
| 1 | 使用正式管理员账号登录 | 进入后台，左侧可见用户治理、系统设置 |
| 2 | 创建一个招聘专员账号 | 新账号可登录，角色显示正确 |
| 3 | 创建一个招聘经理/负责人账号 | 新账号可登录，能看到团队看板入口 |
| 4 | 创建一个面试官账号 | 新账号可登录，默认只能看自己的面试路径 |
| 5 | 停用再启用一个测试账号 | 停用后不能登录，启用后可登录 |
| 6 | 重置一个测试账号密码 | 原密码失效，新密码可登录 |
| 7 | 查看系统设置和审计边界 | 页面能打开，并明确 demo / in-memory 边界 |
| 8 | 检查 demo 账号不存在 | 用户列表和数据库中无 `demo.*@hireinsight.local` |

### 4.2 招聘专员

| # | 关键动作 | 成功标准 |
|---|---|---|
| 1 | 使用招聘专员账号登录 | 进入工作台，能看到自己的待办/范围提示 |
| 2 | 创建或确认一个有效岗位 | 岗位列表中有可用于加入流程的有效岗位 |
| 3 | 上传一份试点简历 | 上传成功，有清楚的后续提示 |
| 4 | 到候选人列表查看候选人 | 候选人出现在列表，归属人/负责人清楚 |
| 5 | 将候选人加入流程 | 可选择岗位，候选人进入 AI 初筛或对应阶段 |
| 6 | 推进候选人到下一阶段 | 流程看板阶段变化，历史可追踪 |
| 7 | 安排面试草稿 | 能填写候选人、岗位、面试官账号 ID 并创建面试 |
| 8 | 检查无数据/无可选项提示 | 没岗位、没候选人、没面试官时有原因和下一步 |

### 4.3 招聘经理/负责人

| # | 关键动作 | 成功标准 |
|---|---|---|
| 1 | 使用负责人账号登录 | 工作台展示团队看板和范围说明 |
| 2 | 查看岗位进展 | 能看到岗位状态、候选人阶段和卡点 |
| 3 | 查看候选人归属 | 候选人与负责人/招聘专员口径一致 |
| 4 | 查看招聘专员绩效提示 | 能解释谁推进了多少、卡在哪里 |
| 5 | 查看流程卡点 | 卡点能对应到岗位、阶段或负责人 |
| 6 | 检查 BI 统计口径 | 团队视角与招聘专员个人视角不混淆 |
| 7 | 记录一个负责人分错场景 | 知道由负责人/管理员手动修正，不误认为系统已自动回滚 |

### 4.4 面试官

| # | 关键动作 | 成功标准 |
|---|---|---|
| 1 | 使用面试官账号登录 | 进入工作台或我的面试路径 |
| 2 | 查看“我的面试” | 只看到分配给自己的面试 |
| 3 | 查看候选人材料 | 能看到与本人面试相关的候选人信息 |
| 4 | 填写面试反馈 | 反馈保存成功，招聘专员/负责人可看到 |
| 5 | 没有面试时查看空状态 | 页面说明联系招聘专员安排到正确账号 |
| 6 | 尝试访问管理员页面 | 被拒绝或无入口，不泄露用户治理能力 |
| 7 | 尝试访问无关候选人/流程 | 无权限或不可见，不看到全量候选人池 |

## 5. 备份恢复演练步骤

### 5.1 备份 dry-run

负责人：运维

```bash
cd /srv/hireinsight
set -a
. /etc/hireinsight/hireinsight-pilot.env
set +a
python3 rebuild/scripts/backup_pilot_data.py --dry-run
```

通过标准：

- [ ] 输出的 `DATABASE_URL` 指向真实试点库。
- [ ] 输出的 `UPLOAD_FOLDER` 是持久上传目录。
- [ ] 输出的 `BACKUP_DIR` 是持久备份目录。
- [ ] 没有真正写入备份文件。

### 5.2 执行真实备份

```bash
python3 rebuild/scripts/backup_pilot_data.py
```

通过标准：

- [ ] 输出 `backup complete: /srv/hireinsight/backups/<timestamp>`。
- [ ] 备份目录包含 `database.dump`、`uploads.tar.gz`、`manifest.json`。
- [ ] `manifest.json` 中记录的数据库和上传目录正确。
- [ ] 备份目录权限不对普通试点用户开放。

### 5.3 恢复演练：先恢复到空演练库，避免覆盖真实数据

不要第一次就在真实库上执行 `--confirm`。先创建独立演练库：

```sql
CREATE DATABASE hireinsight_restore_drill;
GRANT ALL PRIVILEGES ON DATABASE hireinsight_restore_drill TO hireinsight_app;
```

切到演练环境变量：

```bash
export DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/hireinsight_restore_drill
export DATABASE_USER=hireinsight_app
export DATABASE_PASSWORD='<同账号密码或演练库密码>'
export UPLOAD_FOLDER=/srv/hireinsight/restore-drill/uploads
export BACKUP_DIR=/srv/hireinsight/backups
```

先 dry-run：

```bash
python3 rebuild/scripts/restore_pilot_data.py --backup-dir /srv/hireinsight/backups/<timestamp>
```

确认只指向演练库后再执行：

```bash
python3 rebuild/scripts/restore_pilot_data.py --backup-dir /srv/hireinsight/backups/<timestamp> --confirm
```

通过标准：

- [ ] `pg_restore` 目标库是 `hireinsight_restore_drill`，不是 `hireinsight`。
- [ ] 演练上传目录是 `/srv/hireinsight/restore-drill/uploads`，不是真实上传目录。
- [ ] 恢复后抽查表数量、候选人数量、上传文件数量符合备份时点。
- [ ] 演练记录写入试点问题/运维记录。

### 5.4 真实事故恢复路径

只有出现误删、误导入、误重置等事故，并经试点负责人确认后，才对真实库执行恢复。

1. 立刻暂停试点并停止后端：
   ```bash
   sudo systemctl stop hireinsight
   ```
2. 对事故后的当前状态再做一次备份，保留现场。
3. 找到事故前最近一个可用备份。
4. 两人复核 `DATABASE_URL`、`UPLOAD_FOLDER`、`--backup-dir`。
5. 先对真实库执行 restore dry-run。
6. 负责人书面确认后执行 `--confirm`。
7. 启动后端，跑健康检查。
8. 管理员、招聘专员、面试官各登录冒烟一次。
9. 记录事故原因、恢复时间、影响范围和后续修复项。

## 6. 试点前检查清单

这份清单可以直接给试点负责人逐项打勾。

### 6.1 部署与安全

- [ ] 前端已执行 `npm ci && npm run build`，Nginx 能访问登录页。
- [ ] Nginx `/api/` 已反代到 Java 后端。
- [ ] 后端使用 `pilot` profile，不混用 `dev`。
- [ ] PostgreSQL 已准备好，schema 已存在，`pilot` 启动校验通过。
- [ ] `JWT_SECRET` 是强随机值。
- [ ] `DATABASE_PASSWORD` 不是 demo 密码。
- [ ] `PUBLIC_REGISTRATION_ENABLED=false`。
- [ ] `CORS_ALLOWED_ORIGINS` 是真实试点域名，不是 `*`。
- [ ] `UPLOAD_FOLDER` 和 `BACKUP_DIR` 是持久目录。
- [ ] `/api/v1/health` 返回 `status=UP`、`database=UP`。
- [ ] 日志可以通过 `journalctl -u hireinsight -f` 或日志文件查看。

### 6.2 数据与账号

- [ ] 真实库中没有 `demo.*@hireinsight.local` 账号。
- [ ] Bootstrap 环境变量只用于首次初始化，正式账号创建后已删除并重启。
- [ ] 正式管理员账号已创建并可登录。
- [ ] 招聘专员、负责人、面试官账号均已创建，角色正确。
- [ ] 不存在共享账号。
- [ ] 试点前已完成一次真实备份。
- [ ] 已完成一次恢复到演练库的恢复演练。

### 6.3 四角色冒烟

- [ ] 管理员冒烟通过。
- [ ] 招聘专员冒烟通过。
- [ ] 招聘经理/负责人冒烟通过。
- [ ] 面试官冒烟通过。
- [ ] 权限边界冒烟通过：面试官不能访问管理员能力，非负责人不看到无关数据。
- [ ] 空数据、无可选岗位、无可选候选人、无可选面试官时，试点人员知道下一步。
- [ ] 误关闭、误淘汰、负责人分错等暂不完整自动补救的事项，已提前告知试点人员。

### 6.4 反馈与回滚

- [ ] 已建立试点问题记录入口，例如飞书群、共享表或项目 issue。
- [ ] 已约定 P0/P1/P2 问题响应人。
- [ ] 已约定数据事故时先停服务、再备份事故现场、再恢复。
- [ ] 已保留上一可用代码版本和部署包。
- [ ] 试点负责人已确认：这不是生产上线。

## 7. 试点人员使用说明

### 7.1 所有人

- 使用分配给自己的账号，不要共用账号。
- 首次登录后如无法进入页面，先联系管理员确认账号是否启用、角色是否正确。
- 不要上传无关人员简历，不要把账号密码、候选人信息、截图发到非试点群。
- 发现问题时按固定格式记录，不要反复尝试批量操作。

问题记录格式：

```text
时间：
角色：
账号：
页面：
操作步骤：
候选人/岗位/面试 ID：
期望结果：
实际结果：
截图或录屏：
是否可复现：
影响范围：
```

### 7.2 招聘专员

主流程：

1. 登录工作台。
2. 创建或确认岗位有效。
3. 上传简历。
4. 在候选人列表查看解析结果。
5. 把候选人加入岗位流程。
6. 在候选人流程看板推进候选人。
7. 安排面试。
8. 查看面试反馈和待办。

注意：

- 如果没有岗位，先创建或联系负责人创建岗位。
- 如果候选人没有出现，记录上传时间和文件名。
- 如果选不到面试官，联系管理员确认面试官账号是否已创建并启用。

### 7.3 招聘经理/负责人

主流程：

1. 登录工作台看团队看板。
2. 检查岗位进展和候选人阶段。
3. 检查候选人归属是否正确。
4. 查看招聘专员绩效提示。
5. 识别流程卡点。
6. 记录负责人分错、岗位关闭错误、误淘汰等需要人工修正的问题。

注意：

- 当前 BI 口径按岗位归属、候选人负责人、流程推进和面试反馈记录解释。
- 负责人分错等问题不一定有自动撤回入口，需要记录后由管理员/负责人手动处理。

### 7.4 面试官

主流程：

1. 登录系统。
2. 打开“我的面试”。
3. 查看候选人材料。
4. 填写面试反馈。
5. 如果没有看到面试，联系招聘专员确认是否安排到正确账号。

注意：

- 面试官只处理自己的面试，不看全量候选人池。
- 面试官不负责推进 Offer、淘汰候选人或管理账号。

### 7.5 管理员

主流程：

1. 创建正式试点账号。
2. 启停账号。
3. 重置密码。
4. 查看系统设置和审计边界。
5. 协助排查账号角色、权限、登录问题。

注意：

- 不直接手工改数据库。
- 不保留 bootstrap 明文密码。
- 不把系统设置里的系统治理和审计 demo 当成生产审计中心。

## 8. 当前 Go / No-Go 结论口径

可以对试点负责人说：

> Java + React 重构版已经可以进入真实用户小范围试点准备。请先按本清单完成服务器部署、环境变量、账号、备份恢复演练和四角色冒烟。清单全部通过后，可以开放给少数真实用户试点。

不能对外说：

> 已经生产上线，或已经具备生产级安全、合规、监控、审计和灾备能力。
