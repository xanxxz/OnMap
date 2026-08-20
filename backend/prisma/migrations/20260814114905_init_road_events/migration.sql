-- CreateEnum
CREATE TYPE "RoadEventType" AS ENUM ('ACCIDENT', 'ROAD_CLOSURE', 'ROADWORKS', 'TRAFFIC', 'ROAD_HAZARD', 'TRAFFIC_LIGHT', 'ROAD_SERVICE', 'ROAD_PATROL', 'OTHER');

-- CreateEnum
CREATE TYPE "RoadEventStatus" AS ENUM ('ACTIVE', 'UNCONFIRMED', 'STALE', 'RESOLVED');

-- CreateTable
CREATE TABLE "road_events" (
    "id" UUID NOT NULL,
    "city_id" VARCHAR(64) NOT NULL,
    "type" "RoadEventType" NOT NULL,
    "status" "RoadEventStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "location" geometry(Point, 4326),
    "confirmation_count" INTEGER NOT NULL DEFAULT 0,
    "rejection_count" INTEGER NOT NULL DEFAULT 0,
    "last_confirmed_at" TIMESTAMPTZ(3),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "road_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "road_events_city_status_expires_idx" ON "road_events"("city_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "road_events_city_type_status_idx" ON "road_events"("city_id", "type", "status");

-- CreateIndex
CREATE INDEX "road_events_created_at_idx" ON "road_events"("created_at");
