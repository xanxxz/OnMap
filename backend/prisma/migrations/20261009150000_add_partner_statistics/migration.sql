CREATE TYPE "PartnerStatAction" AS ENUM ('POINT_OPEN', 'CONTACT_CLICK', 'BANNER_IMPRESSION', 'BANNER_CLICK');

CREATE TABLE "partner_stat_daily" (
  "id" UUID NOT NULL,
  "partner_point_id" UUID NOT NULL,
  "action" "PartnerStatAction" NOT NULL,
  "detail_id" VARCHAR(36) NOT NULL DEFAULT '',
  "day" DATE NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "partner_stat_daily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "partner_stat_daily_count_check" CHECK ("count" >= 0)
);
CREATE UNIQUE INDEX "partner_stat_daily_unique" ON "partner_stat_daily" ("partner_point_id", "action", "detail_id", "day");
CREATE INDEX "partner_stat_daily_point_day_idx" ON "partner_stat_daily" ("partner_point_id", "day");

CREATE TABLE "partner_stat_windows" (
  "id" UUID NOT NULL,
  "partner_point_id" UUID NOT NULL,
  "action" "PartnerStatAction" NOT NULL,
  "detail_id" VARCHAR(36) NOT NULL DEFAULT '',
  "actor_hash" VARCHAR(64) NOT NULL,
  "last_accepted_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "partner_stat_windows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "partner_stat_window_unique" ON "partner_stat_windows" ("partner_point_id", "action", "detail_id", "actor_hash");
CREATE INDEX "partner_stat_window_expiry_idx" ON "partner_stat_windows" ("expires_at");
