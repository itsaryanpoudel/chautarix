#!/usr/bin/env bash
# Tests EXACTLY the file users paste into Supabase (SETUP-ALL-IN-ONE.sql, one transaction like the SQL editor).
# Usage: PGHOST=localhost PGUSER=postgres ./scripts/test-db.sh      (throw-away database only, never production!)
set -euo pipefail
DB=${TEST_DB:-sanghu_test}
cd "$(dirname "$0")/.."
node scripts/bundle-sql.mjs
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/00_supabase_shim.sql
psql -v ON_ERROR_STOP=1 -q -1 -d "$DB" -f supabase/SETUP-ALL-IN-ONE.sql
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/db.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
