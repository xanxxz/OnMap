# OnMap single-VPS staging

This is a staging recipe, not a production-hardening or deployment claim. It keeps PostgreSQL private, publishes only Caddy on ports 80/443, terminates HTTPS at Caddy, and persists PostgreSQL and certificate state in named volumes. There is no global HTTP/SOCKS proxy and mobile REST/Socket.IO connect directly to the public HTTPS API domain.

## Prepare the VPS

Install Docker Engine with the Compose plugin. Allow inbound TCP 80/443 (and optionally UDP 443 for HTTP/3); do not expose port 4000 or PostgreSQL. Point the chosen API hostname to the VPS. Keep SSH restricted to the operator.

From `backend/deploy/vps`:

```sh
cp .env.example .env
cp backend.env.example backend.env
chmod 600 .env backend.env
```

Edit both files locally on the VPS. Generate independent random values for `POSTGRES_PASSWORD` in `.env` and `IDENTITY_SIGNING_SECRET` in `backend.env`; URL-encode reserved characters in the database password inside `backend.env`'s `DATABASE_URL`. That URL must point at host `postgres`, port `5432`, and the same database/user/password as the `POSTGRES_*` settings. The backend container receives only `backend.env`; it does not receive the separate `POSTGRES_PASSWORD` variable. Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of exact `https://` browser origins that need access; leave it empty for native-only clients, which do not send an `Origin` header. Do not use `*` or add URL paths. Do not put secrets in shell history, Git, Docker build args, or support logs. The sample hostname is intentionally nonfunctional.

Bring up the database and apply migrations before starting the API:

```sh
docker compose -f compose.yml up -d postgres
docker compose -f compose.yml --profile migration run --rm migrator
docker compose -f compose.yml up -d backend caddy
docker compose -f compose.yml ps
API_DOMAIN="$(awk -F= '$1 == "API_DOMAIN" { print $2 }' .env)"
curl --fail --show-error "https://${API_DOMAIN}/api/health"
```

Health must report `status: ok`, `database: ok`, and a non-null PostGIS version. Caddy obtains/renews certificates automatically after DNS and inbound 80/443 are correct. For the mobile staging build, set `API_BASE_URL=https://<API_DOMAIN>/api` and `SOCKET_URL=https://<API_DOMAIN>` in the mobile build environment; these settings point directly to the public HTTPS endpoint, not a VPN or Telegram proxy. Verify from a phone on ordinary cellular/Wi-Fi (no VPN): REST uses `https://<API_DOMAIN>/api/...`; Socket.IO uses the same HTTPS origin and upgrades to WebSocket through Caddy. Browser REST and Socket.IO origins are checked against `CORS_ALLOWED_ORIGINS`; this is not an authentication boundary, and native clients without an `Origin` header remain supported.

## Single-instance Telegram consumers

The moderation Bot API poller and MTProto parser runtime each acquire a distinct PostgreSQL session advisory lock. The lock is held on a dedicated PostgreSQL connection for the process lifetime and is released on shutdown; PostgreSQL also releases it if the process or connection dies. A second backend instance cannot start either consumer while the first holds its lock. A lightweight heartbeat detects a lost lock connection and stops that consumer; restart the backend after resolving the database/network issue. The API process may still serve normal REST/Socket.IO traffic if a consumer cannot acquire its lock. Do not bypass this guard or run old images that lack it. This is single-leader protection, not high availability; monitor that the one consumer remains running.

The lock connection means the backend needs one additional PostgreSQL connection per enabled Telegram consumer. Ensure database connection limits account for these plus Prisma connections.

## Telegram smoke tests (run separately)

Do not enable either integration until its secrets are set through the VPS environment file/secret mechanism. Do not print `.env` or run commands with shell tracing (`set -x`).

### A. Moderation Bot API

Use a dedicated staging bot and the configured owner private chat. Confirm only one staging backend instance is running. Check webhook state read-only using a secret-safe operator tool or a local command that redacts the URL; do not call `deleteWebhook` or discard pending updates to “fix” a conflict. This project expects long polling, not webhook delivery.

1. Set `TELEGRAM_MODERATION_BOT_TOKEN` and `TELEGRAM_MODERATION_CHAT_ID`; restart the backend and confirm the safe `Telegram moderation bot enabled` log.
2. Send `/start` to the staging bot and confirm it is accepted only from the configured private owner chat.
3. Run exactly one manual delivery check from `backend`:

   ```sh
   npm run telegram:moderation-smoke
   ```

   Confirm the test notice arrives in the configured private chat. This script sends a real message; run only when intended.
4. To test the inline callback (the delivery-only smoke message has no buttons), create a staging-only event from the staging app, then submit reports from ten distinct test identities, each with a different test installation. The tenth unique report creates the review case and sends the outbox notification with buttons. Press the restore button only while the test event is still active; confirm the response/audit in staging. Do not use a real user/event or choose a restriction action during this smoke.
5. Restart the sole backend and verify polling resumes from the stored update cursor.

### B. MTProto history and parser runtime

Use a separate test user account with access to a controlled staging group/channel, not the moderation bot. A StringSession is equivalent to an account credential. Create it with `npm run telegram:auth` in a trusted environment, then transfer it through the VPS secret channel; never put the session in Git, a Docker image, or shell output. Set `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, and `TELEGRAM_SOURCE_CHAT_ID`.

1. With runtime disabled, run the diagnostic from `backend`:

   ```sh
   npm run telegram:smoke
   ```

   It connects as the configured user, resolves one source, reads at most 30 recent messages, parses them, subscribes for a 20-second live window, then disconnects. It is a real connection and should only be run by the operator on the staging VPS with the test account/source.
2. If that passes, set `TELEGRAM_INGESTION_ENABLED=true` and restart the single backend. Confirm `Telegram ingestion runtime started` and the safe runtime connection snapshot.
3. Post a unique harmless test road message in the controlled staging source. Confirm `NewMessage` reaches parser/runtime; verify expected decision and staging DB/REST/realtime behavior. Edit that same test message and verify `EditedMessage` updates the same external message identity.
4. During a controlled brief network interruption, verify reconnect counters advance and missed messages are recovered from the PostgreSQL cursor. Do not test by stopping PostgreSQL or deleting cursor data on a shared database.
5. Restart the backend and verify the same session reconnects and the cursor prevents duplicate event creation.

Bot API success does not validate MTProto, and `telegram:smoke` does not by itself validate persistence/realtime; perform both checks.

## Backups

Partner marker images are normalized PNG bytes in the separate `partner_image_assets` PostgreSQL table. They are included in the custom-format database dump; there is no writable container directory or separate image volume. After restoring a dump into an isolated database, verify both a partner point's `image_asset_key` and the matching nonempty `partner_image_assets.png_bytes` row before relying on it. A database-only backup is sufficient for these images, but existing dumps made before this migration cannot contain images uploaded later. Do not copy the read-only backend container filesystem as an image backup.

Create an operator-controlled local custom-format dump:

```sh
./backup.sh
```

The script writes only under `backend/deploy/vps/backups/`, which is Git-ignored. Restrict directory permissions, encrypt and copy backups to an independently secured offsite location, and set an owner-approved retention policy. Named Docker volumes are persistence, not backups. Test restoration periodically into a separate disposable PostgreSQL/PostGIS database; never restore over the staging database without an explicit maintenance decision. This starter recipe does not configure offsite storage, encryption keys, backup rotation, or restore automation.

## Operations and limits

- Inspect status/logs without printing environment values: `docker compose -f compose.yml ps` and `docker compose -f compose.yml logs --tail=100 backend`.
- App only listens inside the Compose network; Caddy is the sole published service. PostgreSQL has no host port mapping.
- Docker named volumes survive container replacement but not disk loss. Arrange VPS disk monitoring and offsite backups.
- Deploy updates by pulling the intended source revision, building, running the migration profile, then recreating backend; take a backup first. Review each migration before applying.
- The Compose file runs one backend. Do not scale it horizontally for Telegram. Advisory locks protect Bot API and MTProto separately, but a second instance without the new code is not protected.
- Proxy support is not configured. If MTProto cannot connect from the VPS, stop and add/test an MTProto-specific proxy adapter; do not set process-wide `HTTP_PROXY`/`HTTPS_PROXY`, which could affect unrelated providers.
- Set `TELEGRAM_REVIEW_LOGS_ENABLED=false` unless diagnostics are deliberately required and protected. Never enable framework/library verbose logs for sessions or message payloads in production.
- This setup does not configure monitoring/alerting, automated encrypted offsite backup, firewall policy beyond published ports, or rate limiting/WAF. Confirm the exact production browser origins in `CORS_ALLOWED_ORIGINS` before release; CORS does not replace authentication or abuse controls.
