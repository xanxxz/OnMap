CREATE TYPE "RoadEventSource" AS ENUM ('USER', 'TELEGRAM');

ALTER TABLE "road_events"
  ADD COLUMN "source" "RoadEventSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "resolved_at" TIMESTAMPTZ(3);

CREATE TABLE "telegram_road_event_messages" (
  "id" UUID NOT NULL,
  "source" "RoadEventSource" NOT NULL DEFAULT 'TELEGRAM',
  "source_chat_id" VARCHAR(64) NOT NULL,
  "external_message_id" VARCHAR(160) NOT NULL,
  "road_event_id" UUID,
  "canonical_location_id" VARCHAR(128),
  "source_timestamp" TIMESTAMPTZ(3) NOT NULL,
  "applied_decision" VARCHAR(16) NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "telegram_road_event_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_road_event_messages_source_identity_key"
  ON "telegram_road_event_messages"("source", "source_chat_id", "external_message_id");

CREATE INDEX "telegram_road_event_messages_event_idx"
  ON "telegram_road_event_messages"("road_event_id");

CREATE INDEX "telegram_road_event_messages_location_time_idx"
  ON "telegram_road_event_messages"("canonical_location_id", "source_timestamp");

CREATE INDEX "road_events_source_match_idx"
  ON "road_events"("source", "city_id", "type", "status", "created_at");

ALTER TABLE "telegram_road_event_messages"
  ADD CONSTRAINT "telegram_road_event_messages_road_event_id_fkey"
  FOREIGN KEY ("road_event_id") REFERENCES "road_events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
