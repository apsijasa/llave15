#!/bin/sh
# Compuerta del sitio de Vector Bikes (BG-39): chequeo, build, pruebas y redirecciones contra el
# servidor construido. Uso: sh web/vector-bikes/scripts/test-web.sh
set -eu
PORT="${WEB_PORT:-4398}"
BASE="http://127.0.0.1:$PORT"
pnpm exec astro check --root web/vector-bikes
pnpm exec astro build --root web/vector-bikes
pnpm exec vitest run --config web/vector-bikes/vitest.config.ts
HOST=127.0.0.1 PORT="$PORT" node web/vector-bikes/dist/server/entry.mjs >.web.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT
i=0
until curl -s -o /dev/null "$BASE/"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    cat .web.log
    exit 1
  fi
  sleep 1
done
node web/vector-bikes/scripts/check-redirects.ts "$BASE"
echo "test:web ok"
