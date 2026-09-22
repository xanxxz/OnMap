import type { CityGeoObject } from './city-geo-import.types';
import {
  geometryIsValid,
  mergeManualLocation,
  normalizeStreetMatchName,
} from './city-geo-import.utils';
import {
  parseAreaInventory,
  parseStreetInventory,
} from './osm-city-geo.provider';

describe('city geo normalization and validation', () => {
  it.each([
    ['улица Комарова', 'комарова'],
    ['Комарова улица', 'комарова'],
    ['Саратовское шоссе', 'саратовское'],
    ['проспект Героев', 'героев'],
  ])('normalizes street designators: %s', (input, expected) => {
    expect(normalizeStreetMatchName(input)).toBe(expected);
  });

  it('validates LineString and rejects a one-point street', () => {
    expect(
      geometryIsValid({
        type: 'LineString',
        coordinates: [
          [47.8, 52.01],
          [47.81, 52.02],
        ],
      }),
    ).toBe(true);
    expect(
      geometryIsValid({ type: 'LineString', coordinates: [[47.8, 52.01]] }),
    ).toBe(false);
  });

  it('requires closed polygon rings', () => {
    expect(
      geometryIsValid({
        type: 'Polygon',
        coordinates: [
          [
            [47.8, 52.0],
            [47.9, 52.0],
            [47.9, 52.1],
            [47.8, 52.0],
          ],
        ],
      }),
    ).toBe(true);
    expect(
      geometryIsValid({
        type: 'Polygon',
        coordinates: [
          [
            [47.8, 52.0],
            [47.9, 52.0],
            [47.9, 52.1],
            [47.8, 52.1],
          ],
        ],
      }),
    ).toBe(false);
  });

  it('rejects impossible coordinate jumps', () => {
    expect(
      geometryIsValid({
        type: 'LineString',
        coordinates: [
          [47.8, 52.01],
          [80, 20],
        ],
      }),
    ).toBe(false);
  });

  it('deduplicates OSM ways by normalized street name into MultiLineString', () => {
    const [street] = parseStreetInventory({
      elements: [
        way('улица Комарова', [
          [52.0, 47.8],
          [52.01, 47.81],
        ]),
        way('Комарова улица', [
          [52.01, 47.81],
          [52.02, 47.82],
        ]),
      ],
    });
    expect(street?.geometry.type).toBe('MultiLineString');
  });

  it('uses safe alternate OSM name tags for street matching', () => {
    const [street] = parseStreetInventory({
      elements: [
        {
          type: 'way',
          tags: {
            highway: 'residential',
            name: 'Старое название',
            official_name: 'улица Народного Единства',
          },
          geometry: [
            { lat: 52, lon: 47.8 },
            { lat: 52.01, lon: 47.81 },
          ],
        },
      ],
    });

    expect(street?.aliases).toContain('улица Народного Единства');
  });

  it('extracts real closed OSM area polygons without turning bounds into geometry', () => {
    const [area] = parseAreaInventory({
      elements: [
        {
          type: 'way',
          tags: { name: '1-й микрорайон', landuse: 'residential' },
          geometry: [
            { lat: 52, lon: 47.8 },
            { lat: 52, lon: 47.81 },
            { lat: 52.01, lon: 47.81 },
            { lat: 52, lon: 47.8 },
          ],
        },
      ],
    });

    expect(area).toMatchObject({
      canonicalName: '1-й микрорайон',
      geometry: { type: 'Polygon' },
    });
  });

  it('keeps manual coordinates and aliases over imported data', () => {
    const imported: CityGeoObject = {
      id: 'generated',
      cityId: 'balakovo',
      canonicalName: 'Мистик',
      aliases: ['Мистик'],
      type: 'LANDMARK',
      representativePoint: { latitude: 52, longitude: 47 },
      geometryPrecision: 'POINT_ONLY',
      geoSource: 'YANDEX',
      validationStatus: 'POINT_ONLY',
    };
    expect(
      mergeManualLocation(imported, {
        id: 'mystic',
        title: 'Мистик',
        aliases: ['мистика'],
        kind: 'LANDMARK',
        verifiedCoordinates: { latitude: 52.010344, longitude: 47.781606 },
      }),
    ).toMatchObject({
      id: 'mystic',
      representativePoint: { latitude: 52.010344, longitude: 47.781606 },
      geometryPrecision: 'MANUAL',
      geoSource: 'MANUAL',
      userVerified: true,
    });
  });
});

const way = (name: string, coordinates: readonly [number, number][]) => ({
  type: 'way',
  tags: { name, highway: 'primary' },
  geometry: coordinates.map(([lat, lon]) => ({ lat, lon })),
});
