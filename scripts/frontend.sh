#!/usr/bin/env bash
# 只启动前端（Next.js, :3000）。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/web"

if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "→ 安装前端依赖"
  (cd "$WEB_DIR" && npm install --no-audit --no-fund)
fi

cd "$WEB_DIR"
exec npm run dev
