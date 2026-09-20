#!/usr/bin/env bash
#
# Bring up the website, API gateway, auth, and Postgres together.
# Usage: npm run stack:up

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUPABASE_DIR="$ROOT/infra/supabase/docker"
SUPABASE_ENV="$ROOT/infra/supabase/.env"

info() { printf '\033[1;34m→\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

compose_supabase() {
  # Run from the fetched stack dir so ./volumes/* paths resolve, and so the
  # copied override + .env are picked up automatically.
  docker compose --project-directory "$SUPABASE_DIR" --env-file "$SUPABASE_ENV" "$@"
}

command -v docker >/dev/null 2>&1 || fail "Docker is required."
docker info >/dev/null 2>&1 || fail "Docker is installed but the daemon is not running. Start Docker Desktop."
command -v node >/dev/null 2>&1 || fail "Node is required (see .nvmrc)."

info "Generating local secrets (existing values are kept)…"
node "$ROOT/scripts/gen-local-env.mjs"

info "Fetching the pinned Supabase compose stack…"
bash "$ROOT/infra/supabase/bootstrap.sh"

[[ -f "$SUPABASE_DIR/docker-compose.yml" ]] \
  || fail "Bootstrap did not produce infra/supabase/docker/docker-compose.yml"

info "Starting backend + database…"
compose_supabase up -d

info "Building and starting the website…"
docker compose --env-file "$ROOT/.env" up --build -d

info "Waiting for the API gateway and the website…"
ANON_KEY="$(grep '^ANON_KEY=' "$SUPABASE_ENV" | cut -d= -f2-)"
deadline=$((SECONDS + 180))
api_up=0
web_up=0
while (( SECONDS < deadline )); do
  if curl -sf -o /dev/null --max-time 2 \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    "http://127.0.0.1:54321/auth/v1/health"; then
    api_up=1
  fi
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:3000"; then
    web_up=1
  fi
  if (( api_up == 1 && web_up == 1 )); then
    break
  fi
  sleep 3
done

echo
if (( web_up == 1 )); then
  printf '\033[1;32m✓\033[0m Website:      http://localhost:3000\n'
else
  printf '\033[1;33m!\033[0m Website is still starting —  http://localhost:3000\n'
  printf '    docker compose logs -f web\n'
fi
if (( api_up == 1 )); then
  printf '\033[1;32m✓\033[0m API gateway:  http://localhost:54321\n'
else
  printf '\033[1;33m!\033[0m API gateway is still starting — http://localhost:54321\n'
  printf '    docker compose --project-directory infra/supabase/docker logs -f kong analytics\n'
fi
printf '  Studio:       http://localhost:54323\n'
printf '  Postgres:     localhost:5432  (user postgres, db postgres)\n'
echo
printf 'Phone app stays on the host:  npm start\n'
printf 'Stop everything:              npm run stack:down\n'
