#!/usr/bin/env bash
# Read-only schema export. Requires an installed, authenticated Supabase CLI.
# Never repairs migration history or exports household/authentication data.
set -euo pipefail
: "${SUPABASE_PROJECT_ID:?Define SUPABASE_PROJECT_ID (Project Settings → General → Reference ID)}"
[[ "$SUPABASE_PROJECT_ID" =~ ^[a-z0-9]{20}$ ]] || { echo 'Invalid project reference' >&2; exit 1; }
command -v supabase >/dev/null || { echo 'Install the Supabase CLI before running this export.' >&2; exit 1; }
supabase --version
supabase db dump --help >/dev/null
OUT=supabase/baseline
mkdir -p "$OUT"
TASK_TMP=$(mktemp -d "$OUT/.export-XXXXXX")
trap 'rm -rf "$TASK_TMP"' EXIT
supabase link --project-ref "$SUPABASE_PROJECT_ID"
supabase migration list --linked > "$TASK_TMP/migraciones_aplicadas.txt"
supabase db dump --linked \
  --schema public,platform_security,sharing_security,household_integrity,finance_receipt_security \
  -f "$TASK_TMP/schema.sql"
test -s "$TASK_TMP/schema.sql"
mv "$TASK_TMP/schema.sql" "$OUT/schema.sql"
mv "$TASK_TMP/migraciones_aplicadas.txt" "$OUT/migraciones_aplicadas.txt"
echo "Exported schema to $OUT/schema.sql. Review it before using it in an isolated environment."
