#!/usr/bin/env bash
# 只启动后端（FastAPI, :8001）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
VENV="$BACKEND_DIR/.venv"
BACKEND_PORT="${BACKEND_PORT:-8001}"

if [ ! -d "$VENV" ]; then
  echo "→ 创建 Python 虚拟环境"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
fi

cd "$BACKEND_DIR"
exec "$VENV/bin/python" -m uvicorn app.main:app \
  --host 127.0.0.1 --port "$BACKEND_PORT" --reload
