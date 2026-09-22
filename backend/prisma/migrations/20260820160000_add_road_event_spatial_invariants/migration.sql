-- Restore geometry for legacy rows where scalar coordinates are present.
UPDATE "road_events"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)
WHERE "location" IS NULL;

-- New RoadEvent rows must always have the PostGIS representation.
ALTER TABLE "road_events"
ALTER COLUMN "location" SET NOT NULL;

-- Keep scalar and PostGIS coordinates synchronized at the database level.
ALTER TABLE "road_events"
ADD CONSTRAINT "road_events_coordinates_consistent_check"
CHECK (
  "longitude" BETWEEN -180.0 AND 180.0
  AND "latitude" BETWEEN -90.0 AND 90.0
  AND NOT ST_IsEmpty("location")
  AND ST_X("location") = "longitude"
  AND ST_Y("location") = "latitude"
);

-- Accelerate PostGIS bounding-box queries.
CREATE INDEX "road_events_location_gist_idx"
ON "road_events"
USING GIST ("location");
