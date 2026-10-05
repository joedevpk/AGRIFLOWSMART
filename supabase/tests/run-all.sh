#!/usr/bin/env bash
# Rejoue TOUTES les migrations sur une base PostgreSQL VIERGE puis tous les tests SQL / concurrence.
#
#  - arrêt immédiat à la première erreur, code de sortie != 0, nom du fichier fautif affiché ;
#  - aucune erreur n'est masquée (ni `|| true`, ni `grep -v ... || true`) ;
#  - NOTICE / WARNING sont affichés mais ne font pas échouer ; toute ligne `ERROR:` dans la sortie fait échouer,
#    même si psql a rendu la main avec un code 0 (ex. `\set ON_ERROR_STOP off` oublié dans un test).
#
# Usage (utilisateur ayant le droit de createdb ; en root sous Debian : `su postgres -c "bash supabase/tests/run-all.sh"`) :
#   bash supabase/tests/run-all.sh
# Variables : DB (défaut agri_test), MIGRATIONS_DIR (défaut supabase/migrations), TESTS_DIR (défaut supabase/tests).
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=${DB:-agri_test}
MIGRATIONS_DIR=${MIGRATIONS_DIR:-supabase/migrations}
TESTS_DIR=${TESTS_DIR:-supabase/tests}
LOG=$(mktemp)
export DB TESTS_DIR
trap 'rm -f "$LOG"; dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

fail() { echo; echo "ÉCHEC : $*" >&2; exit 1; }

# Exécute un fichier SQL ; échoue sur le moindre ERROR et dit lequel.
run_sql_file() {
  local file=$1
  if ! psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$file" >"$LOG" 2>&1; then
    echo "----- sortie de psql ($file) -----" >&2; tail -n 25 "$LOG" >&2
    fail "psql a échoué sur $file"
  fi
  if grep -Eq '(^|: )ERROR: ' "$LOG"; then
    echo "----- sortie de psql ($file) -----" >&2; grep -En '(^|: )ERROR: ' "$LOG" | head -n 10 >&2
    fail "erreur détectée dans la sortie de $file (code de retour 0 mais ligne ERROR)"
  fi
  local warnings; warnings=$(grep -cE '(^|: )WARNING: ' "$LOG" || true)
  [ "$warnings" -eq 0 ] || echo "  (avertissements : $warnings dans $file)"
  cat "$LOG" | grep -E '^( ok| OK|.*: OK|.*TOUS)' || true   # lignes de succès des tests, purement informatif
}

fresh_db() {
  dropdb --if-exists "$DB" >/dev/null 2>&1 || fail "dropdb $DB impossible"
  createdb "$DB" || fail "createdb $DB impossible"
  run_sql_file "$TESTS_DIR/00_supabase_stubs.sql"
  local count=0 f
  while IFS= read -r f; do
    echo "migration : $(basename "$f")"
    run_sql_file "$f"
    count=$((count + 1))
  done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)
  [ "$count" -gt 0 ] || fail "aucune migration trouvée dans $MIGRATIONS_DIR"
  echo "→ $count migrations appliquées sur une base vierge"
}

tests=0
while IFS= read -r t; do
  echo; echo "== $(basename "$t") =="
  fresh_db
  case "$t" in
    *.sql) run_sql_file "$t" ;;
    *.sh)  bash "$t" || fail "$t a échoué" ;;
  esac
  tests=$((tests + 1))
done < <(find "$TESTS_DIR" -maxdepth 1 \( -name '[1-9][0-9]_*.sql' -o -name '[1-9][0-9]_*.sh' \) | LC_ALL=C sort)

[ "$tests" -gt 0 ] || fail "aucun test trouvé dans $TESTS_DIR"
echo; echo "SQL : $tests fichiers de test exécutés, toutes les migrations appliquées — PASS"
