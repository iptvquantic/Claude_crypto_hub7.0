#!/usr/bin/env bash
# Banco do NEXUS HUB testado num Postgres local (nunca toca na produção). Uso: bash dev/supabase/test-db.sh
# Testa o schema sozinho (como está aplicado) e o schema + migrações; cada um duas vezes (idempotente).
set -euo pipefail
cd "$(dirname "$0")"
DB=${NX_TEST_DB:-nexushub_test}
if ! psql -X -d postgres -Atc 'select 1' >/dev/null 2>&1; then
  if command -v pg_ctlcluster >/dev/null && [ "$(id -u)" = 0 ]; then
    read -r ver cluster _ < <(pg_lsclusters -h | head -1)
    pg_ctlcluster "$ver" "$cluster" start 2>/dev/null || true; sleep 1
    su postgres -c "createuser -s $(whoami)" 2>/dev/null || true
  fi
fi
export PGOPTIONS='-c client_min_messages=warning'
q() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null; }
for fase in "schema" "schema+migracoes"; do
  dropdb --if-exists "$DB" && createdb "$DB"
  q -f test/stub.sql
  for i in 1 2; do
    q -f schema.sql
    if [ "$fase" != "schema" ]; then for m in migrations/*.sql; do q -f "$m"; done; fi
  done
  q -f test/rls.sql
  echo "   ok: $fase"
done
echo "✅ banco: tudo certo"
