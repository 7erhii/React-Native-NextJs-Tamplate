#!/usr/bin/env bash
#
# Fetches the official Supabase Docker Compose stack, pinned to a known revision,
# and layers this project's artifacts on top.
#
# Why fetch rather than commit our own compose file: the stack is Postgres,
# GoTrue, PostgREST, Realtime, Storage, an API gateway, and Studio, wired together
# by a web of inter-service secrets and JWT expectations. Hand-maintaining that is
# a version-sensitive integration surface with no upside. Everything
# project-specific — env template, auth flags, SQL migrations — lives in this
# repository instead.
#
# Idempotent: safe to re-run.

set -euo pipefail

# Pinned so two developers get byte-identical stacks. Bump deliberately.
# v1.24.07 was never published; v1.24.09 is the nearest tag that matches our env template.
SUPABASE_REF="${SUPABASE_REF:-v1.24.09}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$HERE/docker"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

info()  { printf '\033[1;34m→\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker is required but not installed."
command -v git    >/dev/null 2>&1 || fail "git is required but not installed."

if [[ -d "$DOCKER_DIR" ]]; then
  info "Upstream stack already present at infra/supabase/docker — refreshing compose files only."
fi

info "Fetching supabase/supabase at $SUPABASE_REF (shallow)…"
git clone --quiet --depth 1 --branch "$SUPABASE_REF" \
  https://github.com/supabase/supabase.git "$WORK_DIR/supabase" 2>/dev/null \
  || git clone --quiet --depth 1 https://github.com/supabase/supabase.git "$WORK_DIR/supabase"

[[ -d "$WORK_DIR/supabase/docker" ]] || fail "Upstream layout changed: docker/ not found."

mkdir -p "$DOCKER_DIR"
# -n so a re-run never clobbers local volume data or edits.
cp -Rn "$WORK_DIR/supabase/docker/." "$DOCKER_DIR/" 2>/dev/null || true
cp -f "$WORK_DIR/supabase/docker/docker-compose.yml" "$DOCKER_DIR/docker-compose.yml"

info "Linking our migrations into the database init directory…"
INIT_DIR="$DOCKER_DIR/volumes/db/init"
mkdir -p "$INIT_DIR"
# Prefixed so they run after the upstream initialization scripts.
for migration in "$HERE"/migrations/*.sql; do
  cp -f "$migration" "$INIT_DIR/zz-$(basename "$migration")"
done
# The official compose mounts individual files, not this folder. The project
# override maps zz-*.sql onto /docker-entrypoint-initdb.d/migrations/.

info "Placing our compose override…"
cp -f "$HERE/docker-compose.override.yml" "$DOCKER_DIR/docker-compose.override.yml"

if [[ ! -f "$HERE/.env" ]]; then
  warn "No infra/supabase/.env yet. Copy .env.example and fill it in:"
  warn "    cp infra/supabase/.env.example infra/supabase/.env"
  warn "Generate secrets with:  openssl rand -hex 32"
else
  cp -f "$HERE/.env" "$DOCKER_DIR/.env"
  info "Copied your .env into the stack directory."
fi

cat <<'NEXT'

Bootstrap complete. Next:

  1. Fill in infra/supabase/.env   (see .env.example)
  2. Re-run this script so the .env is copied into the stack
  3. cd infra/supabase/docker && docker compose up -d

  Studio:      http://localhost:54323
  API gateway: http://localhost:54321

Migrations apply on the database's FIRST boot. To re-apply after editing them:

  cd infra/supabase/docker && docker compose down -v && docker compose up -d

  (down -v deletes the database volume and therefore all local data.)

NEXT
