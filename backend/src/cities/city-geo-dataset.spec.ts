import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BALAKOVO_APPLIED_GEO_MANIFEST,
  BALAKOVO_CITY_CONFIG,
} from './balakovo/balakovo.config';

describe('applied Balakovo city geo dataset', () => {
  it('loads the applied inventory once with the expected release counts', () => {
    expect(BALAKOVO_APPLIED_GEO_MANIFEST).toMatchObject({
      schemaVersion: 1,
      datasetVersion: 1,
      cityId: 'balakovo',
      streets: 221,
      streetsWithGeometry: 187,
      ambiguousStreets: 34,
      bridges: 4,
      areas: 5,
      settlements: 5,
    });

    const streets = BALAKOVO_CITY_CONFIG.locations.filter(
      ({ kind }) => kind === 'STREET',
    );
    expect(streets).toHaveLength(221);
    expect(streets.filter(({ streetGeometry }) => streetGeometry)).toHaveLength(
      187,
    );
    expect(
      streets.filter(
        ({ streetGeometryStatus }) => streetGeometryStatus === 'AMBIGUOUS',
      ),
    ).toHaveLength(34);
  });

  it('keeps the three imported bridge identities out of STREET inventory', () => {
    for (const title of ['Мировский мост', 'Шлюзовой мост', 'Мост Победы']) {
      expect(
        BALAKOVO_CITY_CONFIG.locations.find((entry) => entry.title === title),
      ).toMatchObject({ kind: 'BRIDGE' });
      expect(
        BALAKOVO_CITY_CONFIG.locations.some(
          (entry) => entry.title === title && entry.kind === 'STREET',
        ),
      ).toBe(false);
    }
  });

  it('keeps Mayanga as one settlement with no fake area geometry', () => {
    const mayanga = BALAKOVO_CITY_CONFIG.locations.filter(
      ({ title }) => title === 'Маянга',
    );
    expect(mayanga).toHaveLength(1);
    expect(mayanga[0]).toMatchObject({
      kind: 'SETTLEMENT',
      representativePoint: { latitude: 51.895907, longitude: 47.614321 },
    });
    expect(mayanga[0]?.areaGeometry).toBeUndefined();
  });

  it.each([
    ['Мост Победы', ['новый', 'победа', 'новый мост']],
    ['1-й микрорайон', ['первый', 'первом']],
    ['Дзержинский район', ['держуха', 'дж']],
    ['Оранж', ['оранж', 'оронж']],
    ['Хлебозавод', ['хлеб завод', 'хлебзавод']],
    ['Мистик', ['мистика', 'мистике']],
    ['Затонский', ['затонского']],
    ['43', ['поволжский', 'поволжского']],
  ])('preserves trusted manual aliases for %s', (title, aliases) => {
    const location = BALAKOVO_CITY_CONFIG.locations.find(
      (entry) => entry.title === title,
    );
    expect(location).toBeDefined();
    expect(location?.aliases).toEqual(expect.arrayContaining(aliases));
  });

  it('contains no runtime timestamps or credential fields', () => {
    const dataset = readFileSync(
      join(__dirname, 'data', 'balakovo', 'imported-locations.json'),
      'utf8',
    );
    expect(dataset).not.toContain('importedAt');
    expect(dataset).not.toContain('generatedAt');
    expect(dataset).not.toMatch(/api[_-]?key|api[_-]?hash|session/iu);
  });
});
