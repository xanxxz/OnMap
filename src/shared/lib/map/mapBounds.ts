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