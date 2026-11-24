#!/usr/bin/env bash
# Spin up a throwaway Postgres, apply migrations, run the RLS tests.
# Needs local Postgres 16+ binaries (initdb, pg_ctl). No Docker needed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
SOCK="$DATA/sock"
mkdir -p "$SOCK"

cleanup() { "$PGBIN/pg_ctl" -D "$DATA/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA"
  RUN_AS="runuser -u postgres --"
fi

$RUN_AS "$PGBIN/initdb" -D "$DATA/db" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$DATA/db" -o "-p $PORT -k $SOCK -c listen_addresses='' -c wal_level=logical" -w start >/dev/null

PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/01_phase1_rls_test.sql"
