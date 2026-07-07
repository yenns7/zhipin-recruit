# Java + Vue 重构版真实用户小范围试点部署说明

本文件只覆盖 `rebuild/` 下的 Java Spring Boot + Vue 重构版。当前目标是**真实用户小范围试点更稳**，不是生产上线。

如果要交给试点负责人逐项执行，使用 [../docs/17_JavaVue真实试点前落地准备清单.md](../docs/17_JavaVue真实试点前落地准备清单.md)。本文保留部署说明和命令样例。

## 1. 试点运行形态

推荐服务器形态：

- 前端：`rebuild/frontend-vue` 构建静态文件，由 Nginx 托管。
- 后端：`rebuild/backend-java` 以 `pilot` profile 启动，监听 `127.0.0.1:8080` 或内网端口。
- 数据库：PostgreSQL，保存账号、岗位、候选人、流程、面试反馈等真实试点数据。
- 上传文件：保存到持久目录，例如 `/srv/hireinsight/uploads`，不要放在 `/tmp`。
- 备份目录：例如 `/srv/hireinsight/backups`，和上传目录、数据库一并纳入服务器备份策略。

## 2. 环境变量

从样例复制一份到服务器安全位置：

```bash
cp rebuild/backend-java/.env.pilot.example /etc/hireinsight/hireinsight-pilot.env
chmod 600 /etc/hireinsight/hireinsight-pilot.env
```

必须改掉这些值：

- `JWT_SECRET`：用强随机串，至少 32 字符，不要使用默认 `change-me...`。
- `DATABASE_PASSWORD`：不要使用本地 demo 密码 `hipass`。
- `CORS_ALLOWED_ORIGINS`：写真实试点前端域名，不要写 `*`。
- `UPLOAD_FOLDER`：写持久目录，不要写 `/tmp`。
- `PILOT_BOOTSTRAP_ADMIN_EMAIL/PASSWORD`：只用于首次创建管理员，首次登录后删除并重启后端。

生成 JWT 示例：

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

字段级加密说明：Java rebuild 当前没有字段级加密实现，不能声称 `FIELD_ENCRYPTION_KEY` 生效。真实试点先依赖 PostgreSQL 权限、HTTPS、服务器权限、备份与角色权限控制；字段级加密列为后续安全专项。

## 3. PostgreSQL

创建库和账号示例：

```sql
CREATE DATABASE hireinsight;
CREATE USER hireinsight_app WITH PASSWORD 'replace-with-strong-password';
GRANT ALL PRIVILEGES ON DATABASE hireinsight TO hireinsight_app;
```

真实试点使用 `pilot` profile，`ddl-auto=validate`，不会自动重建表。首次试点前如果是空库，需要先由负责人确认建表方式；不要在真实数据环境运行会清空数据的 seed/reset 脚本。

数据不会因为后端重启丢失：账号、岗位、候选人、流程、面试反馈等写入 PostgreSQL；上传文件写入 `UPLOAD_FOLDER`。

## 4. 构建与启动

前端构建：

```bash
cd rebuild/frontend-vue
npm install
npm run build
```

后端构建与启动：

```bash
cd rebuild/backend-java
mvn test
mvn spring-boot:run -Dspring-boot.run.profiles=pilot
```

服务器建议用 systemd 加载环境文件：

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

Nginx 反代示例：

```nginx
server {
    listen 443 ssl;
    server_name hr-pilot.example.com;

    root /srv/hireinsight/rebuild/frontend-vue/dist;
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

端口：

- 前端本地开发：`5173`
- Java 后端：`8080`
- PostgreSQL：`5432`
- Nginx HTTPS：`443`

## 5. 健康检查与日志

健康检查：

```bash
curl -s https://hr-pilot.example.com/api/v1/health
```

正常应看到：

```json
{
  "data": {
    "status": "UP",
    "database": "UP",
    "service": "hireinsight-api"
  }
}
```

如果数据库不可用，接口会返回 `503`，`database=DOWN`。

日志位置：

- systemd：`journalctl -u hireinsight -f`
- Spring Boot 文件日志：按 `LOGGING_FILE_NAME`，例如 `/var/log/hireinsight/backend.log`
- Nginx：按服务器 Nginx 配置，一般在 `/var/log/nginx/`

## 6. 备份与恢复

备份前先确认环境变量：

```bash
export DATABASE_URL=jdbc:postgresql://127.0.0.1:5432/hireinsight
export DATABASE_USER=hireinsight_app
export DATABASE_PASSWORD='<数据库密码>'
export UPLOAD_FOLDER=/srv/hireinsight/uploads
export BACKUP_DIR=/srv/hireinsight/backups
```

预演：

```bash
python3 rebuild/scripts/backup_pilot_data.py --dry-run
```

执行备份：

```bash
python3 rebuild/scripts/backup_pilot_data.py
```

建议每天至少一次 `pg_dump` 备份，并保留 7 天以上。备份内容包括：

- `database.dump`
- `uploads.tar.gz`
- `manifest.json`

恢复预演：

```bash
python3 rebuild/scripts/restore_pilot_data.py --backup-dir /srv/hireinsight/backups/<timestamp>
```

确认恢复：

```bash
python3 rebuild/scripts/restore_pilot_data.py --backup-dir /srv/hireinsight/backups/<timestamp> --confirm
```

误删、误导入、误重置恢复路径：

1. 立刻停止后端，避免继续写入错误数据。
2. 先对当前状态再做一次备份，保留事故现场。
3. 选择事故前的备份目录，执行恢复 dry-run。
4. 负责人确认后执行 `--confirm`。
5. 重启后端，访问 `/api/v1/health`。
6. 用管理员、招聘专员、面试官账号各冒烟一次。

## 7. 常见故障排查

登录失败：

- 401：邮箱或密码不对，或 token 已失效。
- 403：账号被停用，或公开注册已关闭。
- bootstrap 管理员只创建一次；已有账号不会被覆盖。

数据库连不上：

- 检查 `DATABASE_URL/DATABASE_USER/DATABASE_PASSWORD`。
- 检查 PostgreSQL 是否启动、端口是否开放。
- 访问 `/api/v1/health`，如果 `database=DOWN`，先处理数据库。

前端 API 404：

- 检查 Nginx `/api/` 是否反代到 `http://127.0.0.1:8080/api/`。
- 检查后端端口是否是 `8080`。

前端 API 401/403：

- 401 通常是未登录或 token 失效。
- 403 通常是角色权限不够，例如面试官访问管理员页面。

端口占用：

```bash
lsof -i :8080
lsof -i :5432
lsof -i :443
```

build/test 失败：

- 前端：先跑 `npm install`，再跑 `npm run build` 和 `npm test`。
- 后端：确认 JDK 21 和 Maven 可用，再跑 `mvn test`。
- 真实试点配置失败时，`pilot` profile 会拒绝启动，请按错误信息修正环境变量。

问题记录与回滚：

- 每个试点问题记录：时间、角色、操作路径、候选人/岗位 ID、截图、是否可复现、影响范围。
- 小问题优先修复配置或数据。
- 数据事故按第 6 节恢复。
- 代码事故回滚到上一可用 git 版本，重新构建前端和后端。

## 8. 当前边界

当前可以进入真实用户小范围试点，但仍不是生产上线：

- 没有完整字段级加密。
- 没有生产级审计中心和监控平台。
- 没有完整灾备演练报告。
- AI 助手、系统设置里的系统治理、通知待办仍有 demo / in-memory 边界。
