# 智聘 · 招聘管理系统 — 生产镜像
#
# 单容器同时托管后端 API 与前端静态产物，与既定部署形态一致
# （见 docs/adr/0001-modular-monolith-by-sidebar-feature.md R2：
# 一个 Flask 后端 + 一个前端 SPA，Flask 同源托管 frontend/dist，不引入新进程拓扑）。
#
# 构建（在仓库根目录执行，需要同时看到 backend/ 和 frontend/）：
#   docker build -f backend/Dockerfile -t zhipin-backend .
# 或用 docker-compose（见根目录 docker-compose.yml）。

# ---- Stage 1: 构建前端静态产物 ----
FROM node:20-slim AS frontend-builder
# npm 官方源在部分网络环境下不稳定（国内常见），可用 --build-arg NPM_REGISTRY=... 覆盖；
# 默认沿用与本机开发一致的淘宝镜像。
ARG NPM_REGISTRY=https://registry.npmmirror.com
# 显式清空代理环境变量：如果构建宿主机的 Docker 配置了全局代理（如 ~/.docker/config.json
# 里的 httpProxy/httpsProxy，常见于用 Clash/V2Ray 之类工具的开发机），该代理地址通常
# 指向宿主机本地端口，在容器网络里不可达，会导致 npm 大批量 ECONNREFUSED，
# 且 npm 10.x 遇到这种批量失败还有已知 bug（"Exit handler never called!"）
# 会把失败错误吞掉、以退出码 0 结束，导致后面 vite/tsc 找不到而报错。
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy=""
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --registry="${NPM_REGISTRY}"
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: 后端运行环境 ----
FROM python:3.12-slim AS backend

# pypi 官方源在部分网络环境下不稳定，可用 --build-arg PIP_INDEX_URL=... 覆盖。
ARG PIP_INDEX_URL=https://pypi.org/simple
# 同上：清空可能被 Docker 全局配置注入、在容器内不可达的宿主机本地代理。
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy=""

# psycopg[binary] 已带预编译 wheel，无需系统 libpq-dev；curl 用于容器内自检 /health；
# git 是 requirements.txt 里 kabi-boss-cli（BOSS 直聘 CLI，从 GitHub 源码安装，
# 见 requirements.txt 注释）的 pip 依赖，没有 git 会在 pip install 阶段直接报错退出。
RUN apt-get update && apt-get install -y --no-install-recommends curl git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -i "${PIP_INDEX_URL}" -r requirements.txt

COPY backend/ .
# base_agent 被 backend/app/config.py 通过 sys.path 引入，需要一并放进镜像。
COPY base_agent/ /app/base_agent/

# 前端构建产物：Flask 同源托管（见 app/__init__.py FRONTEND_DIST）。
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

RUN mkdir -p uploads instance

ENV PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend/dist \
    PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://127.0.0.1:5000/health || exit 1

# 生产用 gunicorn（DEPLOYMENT.md §6 方案 B 既定命令），AI 助手 SSE 需要较长 timeout。
# --preload：没有它，2 个 worker 各自独立跑 create_app()->db.create_all()，新库首次启动
# 会并发抢建表报错退出（实测发现，见 DEPLOYMENT.md 方案 B 说明）。
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "120", "--keep-alive", "5", "--preload", "run:app"]
