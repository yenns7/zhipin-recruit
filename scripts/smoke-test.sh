#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

echo "=========================================="
echo "  智聘系统冒烟测试"
echo "=========================================="

# ---- 后端冒烟（H2 内存库，无需 PostgreSQL）----
echo ""
echo "[1/2] 后端 API 冒烟测试 (H2 内存库)..."
cd "$ROOT/rebuild/backend-java"
if mvn test -Dtest=SmokeTest -q; then
  echo "  ✅ 后端冒烟通过"
else
  echo "  ❌ 后端冒烟失败"
  FAILED=1
fi

# ---- 前端冒烟 ----
echo ""
echo "[2/2] 前端页面冒烟测试 (vitest)..."
cd "$ROOT/frontend"
if npx vitest run src/smoke/SmokeRoutes.test.tsx; then
  echo "  ✅ 前端冒烟通过"
else
  echo "  ❌ 前端冒烟失败"
  FAILED=1
fi

# ---- 汇总 ----
echo ""
echo "=========================================="
if [ "$FAILED" -eq 0 ]; then
  echo "  ✅ 全部冒烟测试通过"
  exit 0
else
  echo "  ❌ 存在失败，请检查上方输出"
  exit 1
fi
