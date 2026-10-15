CREATE TABLE "push_campaign_city_schedules" (
  "campaign_id" UUID NOT NULL,
  "city_id" VARCHAR(64) NOT NULL,
  "time_zone" VARCHAR(64) NOT NULL,
  "next_run_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  CONSTRAINT "push_campaign_city_schedules_pkey" PRIMARY KEY ("campaign_id", "city_id")
);

CREATE INDEX "push_campaign_city_due_idx" ON "push_campaign_city_schedules"("next_run_at");

ALTER TABLE "push_campaign_city_schedules" ADD CONSTRAINT "push_campaign_city_schedules_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "push_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The only city enabled before this migration is Balakovo. Do not infer a
-- time zone for any future city that is not explicitly configured.
INSERT INTO "push_campaign_city_schedules" ("campaign_id", "city_id", "time_zone", "next_run_at", "ends_at")
SELECT c."id", 'balakovo', 'Europe/Saratov', c."next_run_at", c."ends_at"
FROM "push_campaigns" c
WHERE c."city_ids" @> '["balakovo"]'::jsonb;

ALTER TABLE "push_campaign_runs" ADD COLUMN "city_id" VARCHAR(64) NOT NULL DEFAULT '';
DROP INDEX "push_campaign_run_schedule_key";
CREATE UNIQUE INDEX "push_campaign_run_city_schedule_key"
  ON "push_campaign_runs"("campaign_id", "city_id", "scheduled_at");
