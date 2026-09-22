import { createHash } from 'node:crypto';

import type {
  AreaLocationGeometry,
  CityBounds,
  CityCoordinate,
  CityLocationConfig,
  StreetLocationGeometry,
  StreetLocationGeometryPart,
} from '../../cities/city.types';
import type {
  CityGeoGeometry,
  CityGeoObject,
  CityGeoObjectType,
} from './city-geo-import.types';

const STREET_DESIGNATORS = new Set([
  'аллея',
  'бульвар',
  'дорога',
  'линия',
  'набережная',
  'переулок',
  'проезд',
  'проспект',
  'тупик',
  'улица',
  'шоссе',
]);

export const normalizeGeoName = (value: string): string =>
  value
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[«»"'.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeStreetMatchName = (value: string): string =>
  normalizeGeoName(value)
    .split(' ')
    .filter((part) => !STREET_DESIGNATORS.has(part))
    .join(' ');

export const stableGeoId = (
  cityId: string,
  type: CityGeoObjectType,
  canonicalName: string,
): string => {
  const slug = normalizeGeoName(canonicalName)
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  const hash = createHash('sha256')
    .update(`${cityId}:${type}:${normalizeGeoName(canonicalName)}`)
    .digest('hex')
    .slice(0, 10);

  return `${slug || type.toLocaleLowerCase()}-${hash}`;
};

export const yandexExternalId = (uri: string): string =>
  createHash('sha256').update(uri).digest('hex').slice(0, 24);

export const isFiniteCoordinate = (coordinate: CityCoordinate): boolean =>
  Number.isFinite(coordinate.latitude) &&
  Number.isFinite(coordinate.longitude) &&
  coordinate.latitude >= -90 &&
  coordinate.latitude <= 90 &&
  coordinate.longitude >= -180 &&
  coordinate.longitude <= 180;

export const isCoordinateInsideBounds = (
  coordinate: CityCoordinate,
  bounds: CityBounds,
): boolean =>
  isFiniteCoordinate(coordinate) &&
  coordinate.latitude >= bounds.south &&
  coordinate.latitude <= bounds.north &&
  coordinate.longitude >= bounds.west &&
  coordinate.longitude <= bounds.east;

export const validateBounds = (bounds: CityBounds): boolean =>
  [bounds.west, bounds.south, bounds.east, bounds.north].every(
    Number.isFinite,
  ) &&
  bounds.west < bounds.east &&
  bounds.south < bounds.north &&
  bounds.west >= -180 &&
  bounds.east <= 180 &&
  bounds.south >= -90 &&
  bounds.north <= 90;

export const geometryIsValid = (geometry: CityGeoGeometry): boolean => {
  const maximumSegmentMeters = 100_000;
  const positionValid = ([longitude, latitude]: [number, number]): boolean =>
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90;
  const lineValid = (line: [number, number][]): boolean =>
    line.length >= 2 &&
    line.every(positionValid) &&
    line.slice(1).every((position, index) => {
      const previous = line[index];
      return (
        previous !== undefined &&
        tupleDistanceMeters(previous, position) <= maximumSegmentMeters
      );
    });
  const ringValid = (ring: [number, number][]): boolean =>
    ring.length >= 4 &&
    ring.every(positionValid) &&
    ring[0]?.[0] === ring.at(-1)?.[0] &&
    ring[0]?.[1] === ring.at(-1)?.[1];

  switch (geometry.type) {
    case 'LineString':
      return lineValid(geometry.coordinates);
    case 'MultiLineString':
      return (
        geometry.coordinates.length > 0 && geometry.coordinates.every(lineValid)
      );
    case 'Polygon':
      return (
        geometry.coordinates.length > 0 && geometry.coordinates.every(ringValid)
      );
    case 'MultiPolygon':
      return (
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(
          (polygon) => polygon.length > 0 && polygon.every(ringValid),
        )
      );
  }
};

const tupleDistanceMeters = (
  [firstLongitude, firstLatitude]: [number, number],
  [secondLongitude, secondLatitude]: [number, number],
): number =>
  distanceMeters(
    { latitude: firstLatitude, longitude: firstLongitude },
    { latitude: secondLatitude, longitude: secondLongitude },
  );

const partCoordinates = (
  part: StreetLocationGeometryPart,
): [number, number][] =>
  [part.start, ...(part.intermediate ?? []), part.end].map(
    ({ latitude, longitude }) => [longitude, latitude],
  );

export const manualStreetGeometry = (
  geometry: StreetLocationGeometry,
): Extract<CityGeoGeometry, { type: 'LineString' | 'MultiLineString' }> => {
  const parts = [geometry, ...(geometry.disconnectedParts ?? [])].map(
    partCoordinates,
  );

  return parts.length === 1
    ? { type: 'LineString', coordinates: parts[0] ?? [] }
    : { type: 'MultiLineString', coordinates: parts };
};

export const manualAreaPoint = (
  geometry: AreaLocationGeometry,
): CityCoordinate => geometry.representativePoint;

export const mapManualLocationType = (
  location: CityLocationConfig,
): CityGeoObjectType => location.kind ?? 'LANDMARK';

export const mergeManualLocation = (
  imported: CityGeoObject,
  manual: CityLocationConfig,
): CityGeoObject => {
  const aliases = [...new Set([...manual.aliases, ...imported.aliases])];
  const geometry =
    manual.streetGeometry === undefined
      ? imported.geometry
      : manualStreetGeometry(manual.streetGeometry);
  const representativePoint =
    manual.verifiedCoordinates ??
    (manual.areaGeometry === undefined
      ? imported.representativePoint
      : manualAreaPoint(manual.areaGeometry));
  const manualGeometry =
    manual.streetGeometry !== undefined ||
    manual.areaGeometry !== undefined ||
    manual.verifiedCoordinates !== undefined;

  return {
    ...imported,
    id: manual.id,
    canonicalName: manual.title,
    aliases,
    type: mapManualLocationType(manual),
    ...(representativePoint === undefined ? {} : { representativePoint }),
    ...(geometry === undefined ? {} : { geometry }),
    geometryPrecision: manualGeometry ? 'MANUAL' : imported.geometryPrecision,
    geoSource: manualGeometry ? 'MANUAL' : imported.geoSource,
    userVerified: manualGeometry || imported.userVerified,
    mergeStatus:
      imported.externalSources?.yandex === undefined
        ? 'READY_MANUAL'
        : 'READY_MANUAL_WITH_YANDEX_METADATA',
    ...(manual.streetGeometry === undefined
      ? {}
      : { geometryMatch: { strategy: 'MANUAL' as const } }),
    validationStatus:
      geometry === undefined && representativePoint === undefined
        ? imported.validationStatus
        : 'READY',
  };
};

export const distanceMeters = (
  first: CityCoordinate,
  second: CityCoordinate,
): number => {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
};
