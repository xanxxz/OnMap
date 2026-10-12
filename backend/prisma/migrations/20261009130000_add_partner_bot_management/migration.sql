ALTER TYPE "PartnerPlacementStatus" ADD VALUE 'ENDED';

ALTER TABLE "partner_points"
    ADD COLUMN "agreed_price_kopecks" BIGINT,
    ADD COLUMN "paid_at" TIMESTAMPTZ(3);

ALTER TABLE "partner_city_banners"
    ADD COLUMN "title" VARCHAR(160),
    ADD COLUMN "partner_point_id" UUID,
    ADD COLUMN "agreed_price_kopecks" BIGINT,
    ADD COLUMN "paid_at" TIMESTAMPTZ(3);

ALTER TABLE "partner_points" ADD CONSTRAINT "partner_points_price_check"
    CHECK ("agreed_price_kopecks" IS NULL OR "agreed_price_kopecks" >= 0);
ALTER TABLE "partner_city_banners" ADD CONSTRAINT "partner_city_banners_price_check"
    CHECK ("agreed_price_kopecks" IS NULL OR "agreed_price_kopecks" >= 0);

ALTER TABLE "partner_city_banners" ADD CONSTRAINT "partner_city_banners_partner_point_id_fkey"
    FOREIGN KEY ("partner_point_id") REFERENCES "partner_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "partner_city_banners_partner_point_id_idx" ON "partner_city_banners"("partner_point_id");

CREATE TABLE "partner_bot_drafts" (
    "owner_telegram_id" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "step" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "partner_bot_drafts_pkey" PRIMARY KEY ("owner_telegram_id"),
    CONSTRAINT "partner_bot_drafts_revision_check" CHECK ("revision" >= 0),
    CONSTRAINT "partner_bot_drafts_kind_check" CHECK ("kind" IN ('POINT', 'BANNER'))
);
