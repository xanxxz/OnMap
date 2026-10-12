import {RoadEventReadType} from '../../model/roadEvent';

import {
  getEventMarkerVisualConfig,
} from './eventMarkerVisualConfig';

const TYPES: RoadEventReadType[] = [
  'ROAD_PATROL',
  'ACCIDENT',
  'ROADWORKS',
  'ROAD_CLOSURE',
  'ROAD_HAZARD',
  'HAZARD',
  'TRAFFIC',
  'TRAFFIC_JAM',
  'TRAFFIC_LIGHT',
  'ROAD_SERVICE',
  'OTHER',
];

describe('event marker illustration config', () => {
  it('registers an illustration for every mobile and TomTom event type', () => {
    TYPES.forEach(type => {
      expect(getEventMarkerVisualConfig(type).source).toBeTruthy();
    });
  });

  it('maps provider aliases to the matching illustrated PNG', () => {
    expect(getEventMarkerVisualConfig('TRAFFIC_JAM').source).toBe(
      getEventMarkerVisualConfig('TRAFFIC').source,
    );
    expect(getEventMarkerVisualConfig('HAZARD').source).toBe(
      getEventMarkerVisualConfig('ROAD_HAZARD').source,
    );
  });

  it('keeps original proportions for wide traffic and tall traffic-light artwork', () => {
    const traffic = getEventMarkerVisualConfig('TRAFFIC');
    const trafficLight = getEventMarkerVisualConfig('TRAFFIC_LIGHT');

    expect(traffic.width / traffic.height).toBeCloseTo(1.5);
    expect(traffic.anchor).toBe('center');
    expect(trafficLight.width / trafficLight.height).toBeCloseTo(2 / 3);
    expect(trafficLight.anchor).toBe('bottom');

    [traffic, trafficLight].forEach(asset => {
      const visibleWidth = asset.width * asset.artworkWidthRatio;
      const visibleHeight = asset.height * asset.artworkHeightRatio;

      expect(Math.max(visibleWidth, visibleHeight)).toBeCloseTo(30);
    });
  });

  it('sizes the DPS illustration 12–15% larger than a standard square icon', () => {
    const normalSize = getEventMarkerVisualConfig('ACCIDENT').visibleSize;
    const patrolSize = getEventMarkerVisualConfig('ROAD_PATROL').visibleSize;
    const increase = (patrolSize / normalSize - 1) * 100;

    expect(increase).toBeGreaterThanOrEqual(12);
    expect(increase).toBeLessThanOrEqual(15);
  });
});
