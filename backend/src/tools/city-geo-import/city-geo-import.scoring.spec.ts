import { getCityConfig } from '../../cities/city.registry';
import {
  scoreStreetCandidates,
  selectStrongStreetCandidate,
  uniqueStreetSeeds,
} from './city-geo-importer';
import type {
  OsmAddressEvidence,
  OsmStreetWayCandidate,
} from './city-geo-import.types';
import { parseStreetEvidence } from './osm-city-geo.provider';

const bounds = { west: 47.79, south: 52, east: 47.81, north: 52.02 };
const point = { latitude: 52.01, longitude: 47.8 };

describe('OSM street candidate scoring', () => {
  it('auto-resolves one spatially strong unnamed way', () => {
    const candidate = way(
      'way/1',
      [],
      [
        [47.795, 52.005],
        [47.805, 52.015],
      ],
    );
    const scores = scoreStreetCandidates({
      canonicalName: 'Улица Народного Единства',
      aliases: ['народного единства'],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates: [candidate],
      addresses: [address('Улица Народного Единства', point)],
    });

    expect(selectStrongStreetCandidate([candidate], scores)).toMatchObject({
      candidate: { osmId: 'way/1' },
    });
    expect(scores[0]?.addressEvidenceCount).toBe(1);
  });

  it('keeps equally strong candidates ambiguous', () => {
    const candidates = [
      way(
        'way/1',
        [],
        [
          [47.795, 52.005],
          [47.805, 52.015],
        ],
      ),
      way(
        'way/2',
        [],
        [
          [47.795, 52.015],
          [47.805, 52.005],
        ],
      ),
    ];
    const scores = scoreStreetCandidates({
      canonicalName: 'Тестовая улица',
      aliases: [],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates,
      addresses: [],
    });

    expect(selectStrongStreetCandidate(candidates, scores)).toBeNull();
  });

  it('accepts a clearly leading unnamed way with precise spatial evidence', () => {
    const strong = way(
      'way/strong',
      [],
      [
        [47.785, 51.995],
        [47.8, 52.01],
      ],
    );
    const weak = way(
      'way/weak',
      [],
      [
        [47.79, 52],
        [47.791, 52.001],
      ],
    );
    const scores = scoreStreetCandidates({
      canonicalName: 'Тестовая улица',
      aliases: [],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates: [strong, weak],
      addresses: [],
    });

    expect(scores[0]).toMatchObject({
      candidateId: 'way/strong',
      score: 50,
      distanceToYandexPointMeters: 0,
      boundsOverlapRatio: 0.5,
    });
    expect(selectStrongStreetCandidate([strong, weak], scores)).toMatchObject({
      candidate: { osmId: 'way/strong' },
    });
  });

  it('uses addr:street evidence only for the matching street', () => {
    const candidate = way(
      'way/1',
      [],
      [
        [47.795, 52.005],
        [47.805, 52.015],
      ],
    );
    const withEvidence = scoreStreetCandidates({
      canonicalName: 'Тестовая улица',
      aliases: [],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates: [candidate],
      addresses: [address('Тестовая улица', point)],
    });
    const unrelated = scoreStreetCandidates({
      canonicalName: 'Тестовая улица',
      aliases: [],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates: [candidate],
      addresses: [address('Другая улица', point)],
    });

    expect(withEvidence[0]?.score).toBeGreaterThan(unrelated[0]?.score ?? 0);
  });

  it('strongly prefers a bridge-tagged way for a bridge object', () => {
    const bridge = {
      ...way(
        'way/bridge',
        [],
        [
          [47.795, 52.005],
          [47.805, 52.015],
        ],
      ),
      highway: 'secondary',
      bridge: true,
    };
    const footway = {
      ...way(
        'way/footway',
        [],
        [
          [47.796, 52.005],
          [47.806, 52.015],
        ],
      ),
      highway: 'footway',
      bridge: false,
    };
    const scores = scoreStreetCandidates({
      canonicalName: 'Шлюзовой мост',
      aliases: [],
      yandexPoint: point,
      yandexBounds: bounds,
      candidates: [footway, bridge],
      addresses: [],
    });

    expect(
      selectStrongStreetCandidate([footway, bridge], scores),
    ).toMatchObject({ candidate: { osmId: 'way/bridge' } });
  });

  it('parses OSM addr:street evidence and highway metadata', () => {
    const parsed = parseStreetEvidence({
      elements: [
        {
          type: 'way',
          id: 10,
          tags: { highway: 'primary', bridge: 'yes' },
          geometry: [
            { lat: 52, lon: 47.8 },
            { lat: 52.01, lon: 47.81 },
          ],
        },
        {
          type: 'node',
          id: 20,
          tags: { 'addr:street': 'Улица Народного Единства' },
          lat: 52.005,
          lon: 47.805,
        },
      ],
    });

    expect(parsed.ways[0]).toMatchObject({
      osmId: 'way/10',
      highway: 'primary',
      bridge: true,
    });
    expect(parsed.addresses[0]).toMatchObject({
      osmId: 'node/20',
      streetName: 'Улица Народного Единства',
    });
  });

  it('does not duplicate a trusted BRIDGE as a STREET seed', () => {
    const city = getCityConfig('balakovo');
    expect(city).toBeDefined();
    if (city === undefined) throw new Error('Expected Balakovo city config');
    const seeds = uniqueStreetSeeds(
      city,
      [
        {
          canonicalName: 'Мировский мост',
          aliases: ['Мировский мост'],
          geometry: {
            type: 'LineString',
            coordinates: [
              [47.815, 52.016],
              [47.816, 52.017],
            ],
          },
        },
      ],
      [],
    );

    expect(seeds).not.toContain('Мировский мост');
  });
});

const way = (
  osmId: string,
  names: readonly string[],
  coordinates: [number, number][],
): OsmStreetWayCandidate => ({
  osmId,
  names,
  highway: 'residential',
  bridge: false,
  geometry: { type: 'LineString', coordinates },
  bounds,
});

const address = (
  streetName: string,
  coordinate: { latitude: number; longitude: number },
): OsmAddressEvidence => ({
  osmId: 'node/address',
  streetName,
  coordinate,
});
