#!/usr/bin/env bash
# Teste les migrations SQL (schéma, RLS, RPC, stockage) sur un PostgreSQL local jetable.
# Prérequis : PostgreSQL 14+ installé (initdb, pg_ctl, psql). Aucune donnée Supabase n'est touchée.
#   bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
PORT="${PGTEST_PORT:-54329}"
DIR="$(mktemp -d "${PGTEST_TMP:-${TMPDIR:-/tmp}}/cdp-pg.XXXXXX")"
RUN=""
if [ "$(id -u)" = "0" ]; then   # PostgreSQL refuse de tourner en root
  chown postgres "$DIR"; chmod 755 "$DIR"
  RUN="su postgres -s /bin/bash -c"
fi
sh() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { sh "'$PGBIN/pg_ctl' -D '$DIR/data' -m immediate stop >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT

sh "'$PGBIN/initdb' -D '$DIR/data' -U postgres --auth=trust >/dev/null"
sh "'$PGBIN/pg_ctl' -D '$DIR/data' -o \"-p $PORT -k $DIR -c listen_addresses=''\" -l '$DIR/log' -w start >/dev/null"
PSQL="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"

$PSQL -d postgres -c "create database cdp_test" >/dev/null
# On teste le fichier QUE L'ON LIVRE (setup_all.sql = les migrations concaténées), regénéré à l'instant.
if command -v node >/dev/null 2>&1; then node scripts/bundle-sql.mjs >/dev/null; fi
for f in supabase/tests/00_supabase_stub.sql supabase/setup_all.sql supabase/tests/rls_test.sql; do
  echo "→ $f"
  $PSQL -d cdp_test -f "$f" >/dev/null
done
echo "✔ Tous les tests SQL sont passés."
