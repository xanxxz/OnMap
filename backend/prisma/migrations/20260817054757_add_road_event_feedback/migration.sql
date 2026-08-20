-- CreateEnum
CREATE TYPE "RoadEventFeedbackAction" AS ENUM ('CONFIRM', 'REJECT');

-- CreateTable
CREATE TABLE "road_event_feedback" (
    "id" UUID NOT NULL,
    "road_event_id" UUID NOT NULL,
    "installation_id" VARCHAR(128) NOT NULL,
    "action" "RoadEventFeedbackAction" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_event_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "road_event_feedback_installation_idx" ON "road_event_feedback"("installation_id");

-- CreateIndex
CREATE INDEX "road_event_feedback_created_at_idx" ON "road_event_feedback"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "road_event_feedback_event_installation_key" ON "road_event_feedback"("road_event_id", "installation_id");

-- AddForeignKey
ALTER TABLE "road_event_feedback" ADD CONSTRAINT "road_event_feedback_road_event_id_fkey" FOREIGN KEY ("road_event_id") REFERENCES "road_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
