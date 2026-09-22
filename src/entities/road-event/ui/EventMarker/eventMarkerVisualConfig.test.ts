import {RoadEventReadType} from '../../model/roadEvent';

import {EVENT_MARKER_VISUAL_CONFIG} from './eventMarkerVisualConfig';

const TYPES: RoadEventReadType[] = [
  'ROAD_PATROL',
  'ACCIDENT',
  'ROADWORKS',
  'ROAD_CLOSURE',
  'ROAD_HAZARD',
  'TRAFFIC',
  'TRAFFIC_LIGHT',
  'ROAD_SERVICE',
  'OTHER',
];

describe('EVENT_MARKER_VISUAL_CONFIG', () => {
  it('defines shape, color, glyph and accessibility semantics for every mobile event type', () => {
    TYPES.forEach(type => {
      expect(EVENT_MARKER_VISUAL_CONFIG[type]).toEqual(
        expect.objectContaining({
          shape: expect.any(String),
          color: expect.stringMatching(/^#/),
          glyph: expect.any(String),
          accessibilityName: expect.any(String),
        }),
      );
    });
  });

  it('uses a unique silhouette for each principal road-event category', () => {
    const shapes = TYPES.map(type => EVENT_MARKER_VISUAL_CONFIG[type].shape);

    expect(new Set(shapes).size).toBe(TYPES.length);
  });
});
