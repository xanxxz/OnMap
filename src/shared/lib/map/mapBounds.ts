import {MapBounds} from '../../types/map';

const BOUNDS_PRECISION = 10_000;

const roundCoordinate = (
  value: number,
): number => {
  return (
    Math.round(
      value *
        BOUNDS_PRECISION,
    ) /
    BOUNDS_PRECISION
  );
};

export const normalizeMapBounds = (
  bounds: MapBounds,
): MapBounds => {
  return [
    roundCoordinate(bounds[0]),
    roundCoordinate(bounds[1]),
    roundCoordinate(bounds[2]),
    roundCoordinate(bounds[3]),
  ];
};

export const areMapBoundsEqual = (
  first: MapBounds | null,
  second: MapBounds | null,
): boolean => {
  if (
    first === null ||
    second === null
  ) {
    return first === second;
  }

  return (
    first[0] === second[0] &&
    first[1] === second[1] &&
    first[2] === second[2] &&
    first[3] === second[3]
  );
};

/** Keep map data mounted while the camera moves inside a prefetched area. */
export const expandMapBounds = (bounds: MapBounds): MapBounds => {
  const longitudePadding = (bounds[2] - bounds[0]) * 0.75;
  const latitudePadding = (bounds[3] - bounds[1]) * 0.75;
  return normalizeMapBounds([
    bounds[0] - longitudePadding,
    bounds[1] - latitudePadding,
    bounds[2] + longitudePadding,
    bounds[3] + latitudePadding,
  ]);
};

export const isViewportInsidePrefetch = (
  viewport: MapBounds,
  prefetched: MapBounds,
): boolean => {
  const longitudeMargin = (prefetched[2] - prefetched[0]) * 0.15;
  const latitudeMargin = (prefetched[3] - prefetched[1]) * 0.15;
  return (
    viewport[0] >= prefetched[0] + longitudeMargin &&
    viewport[1] >= prefetched[1] + latitudeMargin &&
    viewport[2] <= prefetched[2] - longitudeMargin &&
    viewport[3] <= prefetched[3] - latitudeMargin
  );
};

export const isCoordinateWithinBounds =
  (
    coordinate: [
      number,
      number,
    ],
    bounds: MapBounds,
  ): boolean => {
    const [
      longitude,
      latitude,
    ] = coordinate;

    const [
      west,
      south,
      east,
      north,
    ] = bounds;

    return (
      longitude >= west &&
      longitude <= east &&
      latitude >= south &&
      latitude <= north
    );
  };
