#!/usr/bin/env bash
# Contrôles STATIQUES des migrations avant `supabase db push` (aucune connexion à une base).
#  1. nom `AAAAMMJJHHMMSS_description.sql`, horodatages uniques et ordonnés ;
#  2. aucune instruction destructrice non justifiée (DROP TABLE / TRUNCATE / DELETE FROM sans WHERE) ;
#  3. chaque migration qui crée une policy fait précéder un DROP POLICY IF EXISTS (rejouable) ;
#  4. si la CLI Supabase est installée ET le projet lié : affiche `supabase migration list` (état local vs distant).
# Une instruction destructrice volontaire se déclare sur la même ligne par le commentaire `-- destructive-ok: raison`.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=${MIGRATIONS_DIR:-supabase/migrations}
fail=0
prev=""
for f in $(find "$DIR" -maxdepth 1 -name '*.sql' | LC_ALL=C sort); do
  name=$(basename "$f")
  if ! [[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then echo "NOM INVALIDE : $name (attendu AAAAMMJJHHMMSS_description.sql)"; fail=1; fi
  ts=${name%%_*}
  if [ "$ts" = "$prev" ]; then echo "HORODATAGE EN DOUBLE : $name"; fail=1; fi
  if [ -n "$prev" ] && [[ "$ts" < "$prev" ]]; then echo "ORDRE INCOHÉRENT : $name"; fail=1; fi
  prev=$ts
  if grep -nEi '^\s*(drop\s+table|truncate)\b' "$f" | grep -vi 'destructive-ok' | grep -v '^\s*--' >/dev/null; then
    echo "INSTRUCTION DESTRUCTRICE dans $name :"; grep -nEi '^\s*(drop\s+table|truncate)\b' "$f" | grep -vi 'destructive-ok'; fail=1
  fi
  if grep -nEi '^\s*delete\s+from\s+[a-z_."]+\s*;' "$f" | grep -vi 'destructive-ok' >/dev/null; then
    echo "DELETE sans WHERE dans $name"; fail=1
  fi
  policies=$(grep -cEi '^\s*create\s+policy' "$f" || true)
  drops=$(grep -cEi '^\s*drop\s+policy\s+if\s+exists' "$f" || true)
  if [ "$policies" -gt "$drops" ]; then echo "POLICY NON REJOUABLE dans $name : $policies CREATE POLICY pour $drops DROP POLICY IF EXISTS"; fail=1; fi
done
[ "$fail" -eq 0 ] || { echo; echo "ÉCHEC : migrations non conformes"; exit 1; }
echo "OK : $(find "$DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ') migrations conformes (nommage, ordre, pas de destruction, policies rejouables)"
if command -v supabase >/dev/null 2>&1 && [ -f supabase/.temp/project-ref ]; then
  echo; echo "== supabase migration list (état local / distant) =="; supabase migration list
else
  echo "(CLI Supabase absente ou projet non lié : comparer ensuite avec « supabase migration list » — voir docs/DEPLOYMENT.md)"
fi
