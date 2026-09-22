CREATE TYPE "RoadEventLocationPrecision" AS ENUM (
  'EXACT',
  'INTERSECTION',
  'LANDMARK',
  'STREET',
  'AREA',
  'SETTLEMENT'
);

ALTER TABLE "road_events"
  ADD COLUMN "location_precision" "RoadEventLocationPrecision",
  ADD COLUMN "location_label" VARCHAR(200),
  ADD COLUMN "source_text" VARCHAR(1000);

UPDATE "road_events"
SET "location_precision" = 'EXACT'::"RoadEventLocationPrecision"
WHERE "source" = 'TELEGRAM'::"RoadEventSource";

ALTER TABLE "road_events"
  DROP CONSTRAINT "road_events_coordinates_consistent_check";

ALTER TABLE "road_events"
  ALTER COLUMN "location" TYPE geometry(Geometry, 4326)
  USING "location"::geometry;

ALTER TABLE "road_events"
  ADD CONSTRAINT "road_events_coordinates_consistent_check"
  CHECK (
    "longitude" BETWEEN -180.0 AND 180.0
    AND "latitude" BETWEEN -90.0 AND 90.0
    AND NOT ST_IsEmpty("location")
    AND ST_SRID("location") = 4326
    AND GeometryType("location") IN ('POINT', 'LINESTRING', 'MULTILINESTRING')
    AND ST_X(ST_PointOnSurface("location")) = "longitude"
    AND ST_Y(ST_PointOnSurface("location")) = "latitude"
  );
