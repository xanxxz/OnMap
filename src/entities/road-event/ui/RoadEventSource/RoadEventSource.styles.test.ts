import {
  approximateAreaHaloPaint,
  telegramApproximateLinePaint,
  telegramApproximateOuterLinePaint,
} from './RoadEventSource.styles';

describe('RoadEvent approximate geometry visual hierarchy', () => {
  it('keeps area precision visually secondary', () => {
    expect(approximateAreaHaloPaint?.['circle-opacity']).toBeLessThan(0.1);
    expect(approximateAreaHaloPaint?.['circle-stroke-opacity']).toBeLessThan(0.2);
  });

  it('colors approximate lines by event type', () => {
    expect(telegramApproximateLinePaint?.['line-color']).toEqual(
      expect.arrayContaining(['ROAD_PATROL', 'ACCIDENT', 'ROADWORKS']),
    );
  });

  it('keeps the outer line softer than the primary line', () => {
    expect(telegramApproximateOuterLinePaint?.['line-opacity']).toBeLessThan(
      telegramApproximateLinePaint?.['line-opacity'] as number,
    );
  });
});
