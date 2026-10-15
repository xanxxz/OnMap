ALTER TABLE "partner_points" ADD COLUMN "promo_terms" VARCHAR(240);

CREATE INDEX "partner_stat_daily_day_action_idx" ON "partner_stat_daily"("day", "action");

CREATE TABLE "anonymous_identities_seen" (
    "identity_hash" CHAR(64) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anonymous_identities_seen_pkey" PRIMARY KEY ("identity_hash")
);

CREATE TABLE "anonymous_identity_count" (
    "id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "anonymous_identity_count_pkey" PRIMARY KEY ("id")
);
