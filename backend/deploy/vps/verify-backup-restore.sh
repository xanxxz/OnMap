#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
dump=${1:?Pass a backup file under backups/}
case "$dump" in
  backups/*.dump) ;;
  *) printf 'Backup must be under backups/.\n' >&2; exit 1 ;;
esac
test -f "$dump"

restore_db="onmap_restore_check_$(openssl rand -hex 4)"
docker compose -f compose.yml exec -T postgres sh -ec \
  'createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$1"' sh "$restore_db"
cleanup() {
  docker compose -f compose.yml exec -T postgres sh -ec \
    'dropdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
}
trap cleanup EXIT

docker compose -f compose.yml exec -T postgres sh -ec \
  'pg_restore --no-owner -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" < "$dump"

docker compose -f compose.yml exec -T postgres sh -ec \
  'psql -U "$POSTGRES_USER" -d "$1" -Atqc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL; SELECT PostGIS_Version(); SELECT count(*) FROM partner_image_assets; SELECT count(*) FROM telegram_source_cursors;"' sh "$restore_db"
printf 'Restore verification completed in a separate temporary database.\n'
