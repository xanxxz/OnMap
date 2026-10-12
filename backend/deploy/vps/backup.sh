#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
umask 077
mkdir -p backups
chmod 700 backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary=$(mktemp "backups/.onmap-${timestamp}.XXXXXX")
random_suffix=${temporary##*.}
destination="backups/onmap-${timestamp}-${random_suffix}.dump"
trap 'rm -f "$temporary"' EXIT HUP INT TERM

docker compose -f compose.yml exec -T postgres sh -ec \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --format=custom --no-owner --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$temporary"
test -s "$temporary"
if [ -e "$destination" ]; then
  printf 'Refusing to overwrite an existing backup.\n' >&2
  exit 1
fi
mv "$temporary" "$destination"
trap - EXIT HUP INT TERM
printf 'Backup created: %s\n' "$destination"
