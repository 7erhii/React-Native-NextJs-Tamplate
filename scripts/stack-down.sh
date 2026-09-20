#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_DIR="$ROOT/infra/supabase/docker"
SUPABASE_ENV="$ROOT/infra/supabase/.env"

docker compose --project-directory "$ROOT" down --remove-orphans || true

if [[ -f "$SUPABASE_DIR/docker-compose.yml" && -f "$SUPABASE_ENV" ]]; then
  docker compose --project-directory "$SUPABASE_DIR" --env-file "$SUPABASE_ENV" down --remove-orphans || true
fi
