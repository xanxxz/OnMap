CREATE TABLE "telegram_bot_panel_sessions" (
  "owner_telegram_id" VARCHAR(64) NOT NULL,
  "screen" VARCHAR(48) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "telegram_bot_panel_sessions_pkey" PRIMARY KEY ("owner_telegram_id")
);

CREATE TABLE "telegram_bot_panel_actions" (
  "token" VARCHAR(24) NOT NULL,
  "owner_telegram_id" VARCHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "action" VARCHAR(48) NOT NULL,
  "payload" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_bot_panel_actions_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "telegram_bot_panel_actions_owner_revision_idx"
  ON "telegram_bot_panel_actions"("owner_telegram_id", "revision");
CREATE INDEX "telegram_bot_panel_actions_expiry_idx"
  ON "telegram_bot_panel_actions"("expires_at");

CREATE TABLE "push_owner_pairings" (
  "id" UUID NOT NULL,
  "owner_telegram_id" VARCHAR(64) NOT NULL,
  "code_hash" VARCHAR(64) NOT NULL,
  "device_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "test_sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_owner_pairings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_owner_pairings_code_hash_key"
  ON "push_owner_pairings"("code_hash");
CREATE INDEX "push_owner_pairings_owner_idx"
  ON "push_owner_pairings"("owner_telegram_id", "consumed_at");
CREATE INDEX "push_owner_pairings_expiry_idx"
  ON "push_owner_pairings"("expires_at");

CREATE TABLE "push_owner_pairing_attempts" (
  "identity_key" VARCHAR(64) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "window_start" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "push_owner_pairing_attempts_pkey" PRIMARY KEY ("identity_key")
);
