CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID');
CREATE TYPE "PushProviderKind" AS ENUM ('APNS', 'FCM');
CREATE TYPE "PushOutboxKind" AS ENUM ('ROAD_EVENT', 'PARTNER_POINT');
CREATE TYPE "PushOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'RETRY', 'SENT', 'CANCELLED');
CREATE TYPE "PartnerPushCampaignStatus" AS ENUM ('AWAITING_CONFIRMATION', 'QUEUED', 'CANCELLED');

CREATE TABLE "push_devices" (
  "id" UUID NOT NULL,
  "identity_key" CHAR(64) NOT NULL,
  "installation_id" UUID NOT NULL,
  "city_id" VARCHAR(64) NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "provider" "PushProviderKind" NOT NULL,
  "token" VARCHAR(512) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_devices_token_hash_key" ON "push_devices"("token_hash");
CREATE UNIQUE INDEX "push_device_identity_installation_key" ON "push_devices"("identity_key", "installation_id");
CREATE INDEX "push_device_city_enabled_idx" ON "push_devices"("city_id", "enabled");

CREATE TABLE "push_outbox" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "dedupe_key" VARCHAR(120) NOT NULL,
  "kind" "PushOutboxKind" NOT NULL,
  "target_id" UUID NOT NULL,
  "city_id" VARCHAR(64) NOT NULL,
  "status" "PushOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "last_error_code" VARCHAR(40),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "push_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_outbox_device_dedupe_key" ON "push_outbox"("device_id", "dedupe_key");
CREATE INDEX "push_outbox_due_idx" ON "push_outbox"("status", "next_attempt_at");
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_push_campaigns" (
  "id" UUID NOT NULL,
  "partner_point_id" UUID NOT NULL,
  "status" "PartnerPushCampaignStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMPTZ(3),
  CONSTRAINT "partner_push_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_push_campaign_point_idx" ON "partner_push_campaigns"("partner_point_id", "approved_at");
