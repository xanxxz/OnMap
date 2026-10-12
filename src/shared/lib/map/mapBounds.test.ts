import {expandMapBounds, isViewportInsidePrefetch} from './mapBounds';

describe('prefetched event bounds', () => {
  const viewport: [number, number, number, number] = [47.78, 52.01, 47.82, 52.05];

  it('retains the same query while a nearby pan stays in the prefetched area', () => {
    const prefetched = expandMapBounds(viewport);
    expect(isViewportInsidePrefetch(viewport, prefetched)).toBe(true);
    expect(isViewportInsidePrefetch([47.79, 52.02, 47.83, 52.06], prefetched)).toBe(true);
  });

  it('fetches a new area after a larger pan or zoom out', () => {
    const prefetched = expandMapBounds(viewport);
    expect(isViewportInsidePrefetch([47.84, 52.01, 47.88, 52.05], prefetched)).toBe(false);
    expect(isViewportInsidePrefetch([47.74, 51.97, 47.86, 52.09], prefetched)).toBe(false);
  });
});
