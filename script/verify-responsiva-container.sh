#!/usr/bin/env bash
# Optional smoke checks for responsiva in Docker (run from repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker: not on PATH — skip container smoke. Run: npx tsx --test server/tests/responsiva-*.test.ts"
  exit 0
fi

echo "== docker compose: build app image (if compose file present) =="
if [[ -f docker-compose.yml ]]; then
  docker compose build
else
  echo "No docker-compose.yml at repo root; skipping compose build."
fi

echo "== Template file visible at compose path (host) =="
TEMPLATE="${RESPONSIVA_TEMPLATE_PATH:-$ROOT/client/src/templates/responsiva_template.docx}"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "FAIL: template missing: $TEMPLATE"
  exit 1
fi
echo "OK: $TEMPLATE"

echo "== Node responsiva unit tests (no DB) =="
npx tsx --test server/tests/responsiva-*.test.ts

echo "Done. For full API smoke, start stack and call GET /api/inventory/:id/responsiva with auth."
