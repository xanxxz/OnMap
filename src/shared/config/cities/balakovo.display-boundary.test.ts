import { balakovoDisplayBoundary } from './balakovo.display-boundary.geojson';
import { balakovoCity } from './balakovo';

type Point = [number, number];
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(cross(a, b, p)) < 1e-12 &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);
const intersects = (a: Point, b: Point, c: Point, d: Point) =>
  (cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0) ||
  onSegment(a, b, c) ||
  onSegment(a, b, d) ||
  onSegment(c, d, a) ||
  onSegment(c, d, b);

describe('static Balakovo OSM display boundary', () => {
  const ring = balakovoDisplayBoundary.coordinates[0];

  it('is a closed, finite longitude/latitude polygon around Balakovo, not a bbox', () => {
    expect(balakovoDisplayBoundary.type).toBe('Polygon');
    expect(new Set(ring.map(point => point.join(','))).size).toBeGreaterThan(
      20,
    );
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [longitude, latitude] of ring) {
      expect(Number.isFinite(longitude) && Number.isFinite(latitude)).toBe(
        true,
      );
      expect(longitude).toBeGreaterThan(47.7);
      expect(longitude).toBeLessThan(47.89);
      expect(latitude).toBeGreaterThan(51.95);
      expect(latitude).toBeLessThan(52.06);
    }
    const xs = ring.map(point => point[0]);
    const ys = ring.map(point => point[1]);
    const bboxArea =
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const signedArea =
      ring
        .slice(0, -1)
        .reduce(
          (sum, point, i) =>
            sum + point[0] * ring[i + 1][1] - ring[i + 1][0] * point[1],
          0,
        ) / 2;
    expect(signedArea).toBeGreaterThan(0); // GeoJSON exterior ring: counterclockwise.
    expect(signedArea / bboxArea).toBeGreaterThan(0.2);
    expect(signedArea / bboxArea).toBeLessThan(0.9);
    const areaKm2 = signedArea * 111.32 ** 2 * Math.cos((52 * Math.PI) / 180);
    expect(areaKm2).toBeGreaterThan(30);
    expect(areaKm2).toBeLessThan(55);
  });

  it('has no self intersections or zero-length edges', () => {
    const edges = ring.length - 1;
    for (let i = 0; i < edges; i++) {
      expect(ring[i]).not.toEqual(ring[i + 1]);
      const segmentKm = Math.hypot(
        (ring[i + 1][0] - ring[i][0]) * 111.32 * Math.cos((52 * Math.PI) / 180),
        (ring[i + 1][1] - ring[i][1]) * 111.32,
      );
      expect(segmentKm).toBeLessThan(2);
      for (let j = i + 2; j < edges; j++) {
        if (i === 0 && j === edges - 1) continue;
        expect(intersects(ring[i], ring[i + 1], ring[j], ring[j + 1])).toBe(
          false,
        );
      }
    }
  });

  it.each([
    ['Балаково', ...balakovoCity.center, true],
    ['Натальино', 47.911068, 52.058754, false],
    ['Ивановка', 47.7434805, 51.9950295, false],
    ['Подсосенки', 47.9068839, 52.0043717, false],
    ['Быков Отрог', 47.815975, 51.924416, false],
    [
      'южная часть Ивановки, ранее пересекавшаяся с городом',
      47.737,
      51.986,
      false,
    ],
  ] as Array<[string, number, number, boolean]>)(
    'checks city inclusion: %s',
    (_name, x, y, expected) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      expect(inside).toBe(expected);
    },
  );

  it('leaves technical coverage unchanged', () => {
    expect(balakovoCity.displayBoundary).toBe(balakovoDisplayBoundary);
    expect(balakovoDisplayBoundary).not.toEqual(balakovoCity.coverageBoundary);
    expect(balakovoCity.coverageBounds).toEqual({
      west: 47.5,
      south: 51.82,
      east: 48.2,
      north: 52.25,
    });
  });
});
