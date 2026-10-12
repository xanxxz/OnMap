CREATE TYPE "PartnerPlacementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');
CREATE TYPE "PartnerContactType" AS ENUM ('PHONE', 'EMAIL', 'WEBSITE', 'TELEGRAM', 'OTHER');

CREATE TABLE "partner_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "description" VARCHAR(1000),
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "display_address" VARCHAR(240),
    "image_asset_key" VARCHAR(240),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "PartnerPlacementStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "partner_points_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_points_period_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "partner_points_coordinates_check" CHECK (
        ("longitude" IS NULL AND "latitude" IS NULL) OR
        ("longitude" IS NOT NULL AND "latitude" IS NOT NULL AND
         "longitude" BETWEEN -180 AND 180 AND "latitude" BETWEEN -90 AND 90)
    ),
    CONSTRAINT "partner_points_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "partner_points_category_check" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "partner_points_image_key_check" CHECK (
        "image_asset_key" IS NULL OR "image_asset_key" ~ '^[A-Za-z0-9_-]+$'
    )
);

CREATE TABLE "partner_point_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partner_point_id" UUID NOT NULL,
    "type" "PartnerContactType" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "partner_point_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_point_contacts_label_check" CHECK (length(btrim("label")) > 0),
    CONSTRAINT "partner_point_contacts_value_check" CHECK (length(btrim("value")) > 0),
    CONSTRAINT "partner_point_contacts_order_check" CHECK ("display_order" >= 0)
);

CREATE TABLE "partner_city_banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city_id" VARCHAR(64) NOT NULL,
    "text" VARCHAR(300),
    "button_label" VARCHAR(80),
    "button_url" VARCHAR(2048),
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "partner_city_banners_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "partner_city_banners_period_check" CHECK (
        "starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"
    )
);

CREATE INDEX "partner_points_visibility_idx" ON "partner_points"("city_id", "status", "starts_at", "ends_at");
CREATE INDEX "partner_points_viewport_idx" ON "partner_points"("city_id", "longitude", "latitude");
CREATE INDEX "partner_point_contacts_order_idx" ON "partner_point_contacts"("partner_point_id", "display_order", "id");
CREATE UNIQUE INDEX "partner_city_banners_city_id_key" ON "partner_city_banners"("city_id");
CREATE INDEX "partner_city_banners_visibility_idx" ON "partner_city_banners"("city_id", "enabled", "starts_at", "ends_at");

ALTER TABLE "partner_point_contacts" ADD CONSTRAINT "partner_point_contacts_partner_point_id_fkey"
    FOREIGN KEY ("partner_point_id") REFERENCES "partner_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
