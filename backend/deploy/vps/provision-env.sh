#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ $EUID -ne 0 ]]; then
  printf 'Run as root on the VPS.\n' >&2
  exit 1
fi

if [[ -e .env || -e backend.env ]]; then
  printf 'Refusing to overwrite existing environment files.\n' >&2
  exit 1
fi

umask 077
compose_tmp=$(mktemp .env.XXXXXXXX)
backend_tmp=$(mktemp backend.env.XXXXXXXX)
trap 'rm -f "$compose_tmp" "$backend_tmp"' EXIT

database_password=$(openssl rand -hex 32)
identity_secret=$(openssl rand -hex 48)

printf '%s\n' \
  'API_DOMAIN=api.balakovo-go.ru' \
  'POSTGRES_DB=onmap' \
  'POSTGRES_USER=onmap' \
  "POSTGRES_PASSWORD=$database_password" > "$compose_tmp"

printf '%s\n' \
  'PORT=4000' \
  "DATABASE_URL=postgresql://onmap:$database_password@postgres:5432/onmap?schema=public" \
  "IDENTITY_SIGNING_SECRET=$identity_secret" \
  'CORS_ALLOWED_ORIGINS=' \
  'TELEGRAM_MODERATION_BOT_TOKEN=' \
  'TELEGRAM_MODERATION_CHAT_ID=' \
  'TELEGRAM_PARTNER_OWNER_IDS=' \
  'TELEGRAM_MODERATION_RESTRICTION_HOURS=24,168,720' \
  'TELEGRAM_API_ID=' \
  'TELEGRAM_API_HASH=' \
  'TELEGRAM_SESSION=' \
  'TELEGRAM_SOURCE_CHAT_ID=' \
  'TELEGRAM_INGESTION_ENABLED=false' \
  'TELEGRAM_REVIEW_LOGS_ENABLED=false' \
  'PUSH_ENQUEUE_ENABLED=false' \
  'PUSH_DELIVERY_ENABLED=false' \
  'OSM_STREET_GEOMETRY_ENABLED=false' > "$backend_tmp"

chmod 600 "$compose_tmp" "$backend_tmp"
mv "$compose_tmp" .env
mv "$backend_tmp" backend.env
trap - EXIT
printf 'Environment files created with owner-only permissions; Telegram and push disabled.\n'
