#!/usr/bin/env bash
# 同时启动后端（FastAPI, :8001）与前端（Next.js, :3000）。
#
#   ./scripts/dev.sh
#
# 前端通过 next.config.js 的 rewrite 把 /api/* 代理到后端，
# 所以浏览器只需要访问 http://localhost:3000。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
WEB_DIR="$ROOT/web"

BACKEND_PORT="${BACKEND_PORT:-8001}"
VENV="$BACKEND_DIR/.venv"

# ── 后端 ──────────────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  echo "→ 创建 Python 虚拟环境"
  python3 -m venv "$VENV"
fi

echo "→ 安装后端依赖"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"

# ── 前端 ──────────────────────────────────────────────────────────────
if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "→ 安装前端依赖"
  (cd "$WEB_DIR" && npm install --no-audit --no-fund)
fi

cleanup() {
  echo ""
  echo "→ 停止服务"
  kill "${BACKEND_PID:-}" 2>/dev/null || true
  kill "${FRONTEND_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ 启动后端 http://localhost:$BACKEND_PORT"
(cd "$BACKEND_DIR" && "$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload) &
BACKEND_PID=$!

# 等后端起来再拉前端，避免首屏请求打空。
sleep 2

echo "→ 启动前端 http://localhost:3000"
(cd "$WEB_DIR" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "─────────────────────────────────────────────"
echo "  前端  http://localhost:3000"
echo "  后端  http://localhost:$BACKEND_PORT/api/health"
echo "─────────────────────────────────────────────"

wait
