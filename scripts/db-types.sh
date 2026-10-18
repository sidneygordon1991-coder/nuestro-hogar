#!/usr/bin/env bash
# Atomic type generation: a failed request cannot erase existing types.
set -euo pipefail
: "${SUPABASE_PROJECT_ID:?Define SUPABASE_PROJECT_ID}"
[[ "$SUPABASE_PROJECT_ID" =~ ^[a-z0-9]{20}$ ]] || { echo 'Invalid project reference' >&2; exit 1; }
command -v supabase >/dev/null || { echo 'Install the Supabase CLI before generating types.' >&2; exit 1; }
supabase --version
supabase gen types --help >/dev/null
TASK_TYPES=$(mktemp src/lib/.database-types-XXXXXX)
trap 'rm -f "$TASK_TYPES"' EXIT
supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" --schema public > "$TASK_TYPES"
test -s "$TASK_TYPES"
mv "$TASK_TYPES" src/lib/database.types.ts
