ALTER TYPE "PushOutboxKind" ADD VALUE 'GENERAL';

CREATE TYPE "PushCampaignKind" AS ENUM ('GENERAL', 'PARTNER_POINT');
CREATE TYPE "PushScheduleKind" AS ENUM ('NOW', 'ONCE', 'DAILY', 'WEEKLY');
CREATE TYPE "PushCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "PushCampaignRunStatus" AS ENUM ('QUEUED', 'SKIPPED');

ALTER TABLE "push_devices"
  ADD COLUMN "road_push_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "news_push_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "push_campaigns" (
  "id" UUID NOT NULL,
  "owner_telegram_id" VARCHAR(64) NOT NULL,
  "kind" "PushCampaignKind" NOT NULL,
  "partner_point_id" UUID,
  "city_ids" JSONB NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "body" VARCHAR(240) NOT NULL,
  "schedule_kind" "PushScheduleKind" NOT NULL,
  "local_time" VARCHAR(5),
  "weekday" INTEGER,
  "ends_at" TIMESTAMPTZ(3),
  "next_run_at" TIMESTAMPTZ(3),
  "status" "PushCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "push_campaign_due_idx" ON "push_campaigns"("status", "next_run_at");
CREATE INDEX "push_campaign_owner_idx" ON "push_campaigns"("owner_telegram_id", "created_at");

CREATE TABLE "push_campaign_runs" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "PushCampaignRunStatus" NOT NULL,
  "audience_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_campaign_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_campaign_run_schedule_key"
  ON "push_campaign_runs"("campaign_id", "scheduled_at");

ALTER TABLE "push_campaign_runs"
  ADD CONSTRAINT "push_campaign_runs_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_outbox" ADD COLUMN "campaign_run_id" UUID;
ALTER TABLE "push_outbox"
  ADD CONSTRAINT "push_outbox_campaign_run_id_fkey"
  FOREIGN KEY ("campaign_run_id") REFERENCES "push_campaign_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "push_bot_drafts" (
  "owner_telegram_id" VARCHAR(64) NOT NULL,
  "step" VARCHAR(32) NOT NULL,
  "payload" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "push_bot_drafts_pkey" PRIMARY KEY ("owner_telegram_id")
);
