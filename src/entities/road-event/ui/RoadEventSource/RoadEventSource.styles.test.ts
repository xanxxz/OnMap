import {
  DPS_EVENT_MARKER_RADIUS,
  REGULAR_EVENT_MARKER_RADIUS,
  selectedEventBodyPaint,
  staleDpsWarningPaint,
} from './RoadEventSource.styles';

describe('RoadEvent marker visual hierarchy', () => {
  it('keeps DPS larger while ordinary marker visuals stay compact', () => {
    expect(REGULAR_EVENT_MARKER_RADIUS * 2).toBe(32);
    expect(DPS_EVENT_MARKER_RADIUS * 2).toBe(38);
    expect(DPS_EVENT_MARKER_RADIUS).toBeGreaterThan(
      REGULAR_EVENT_MARKER_RADIUS,
    );
  });

  it('enlarges the selected marker body without changing the event model', () => {
    expect(selectedEventBodyPaint?.['circle-radius']).toEqual(
      expect.arrayContaining([
        DPS_EVENT_MARKER_RADIUS + 3,
        REGULAR_EVENT_MARKER_RADIUS + 3,
      ]),
    );
  });

  it('uses a visible red warning stroke for disputed DPS markers', () => {
    expect(staleDpsWarningPaint?.['circle-stroke-color']).toBe('#D94348');
    expect(staleDpsWarningPaint?.['circle-stroke-opacity']).toBeGreaterThan(
      0.5,
    );
  });
});
