import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDay,
  dayKey,
  addDays,
  monthGrid,
  parseCalendarInput,
  calendarValue,
  filteredOptions,
  optionIndex,
  popupRect,
  hexRgb,
  rgbHex,
} from '../src/control-model.js';

test('calendar rejects impossible dates, handles leap days and preserves local wall time', () => {
  assert.equal(parseDay('2026-02-29'), null);
  assert.equal(parseCalendarInput('31.04.2026'), null);
  assert.equal(parseCalendarInput('29.02.2028'), '2028-02-29');
  assert.equal(dayKey(parseDay('0099-01-01')), '0099-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(calendarValue('2026-10-28', '4', '5'), '2026-10-28T04:05');
  for (const [h, m] of [
    ['24', '00'],
    ['12', '60'],
    ['-1', '00'],
    ['', '1'],
  ])
    assert.equal(calendarValue('2026-10-28', h, m), null);
});

test('calendar grid starts Monday, includes adjacent dates and has six stable rows', () => {
  const grid = monthGrid(2026, 9);
  assert.equal(grid.length, 42);
  assert.equal(parseDay(grid[0].key).getUTCDay(), 1);
  assert.equal(grid.filter(d => d.inMonth).length, 31);
  assert.equal(grid[0].key, '2026-09-28');
  assert.equal(monthGrid(99, 0).find(d => d.inMonth).key, '0099-01-01');
});

test('combobox filtering is Russian case insensitive and keyboard selection wraps', () => {
  const options = [
    { label: 'Балаково' },
    { label: 'Саратов' },
    { label: 'Новый город' },
  ];
  assert.deepEqual(filteredOptions(options, '  БАЛА '), [options[0]]);
  assert.deepEqual(filteredOptions(options, 'нет'), []);
  assert.equal(optionIndex(0, -1, 3), 2);
  assert.equal(optionIndex(2, 1, 3), 0);
  assert.equal(optionIndex(0, 1, 0), -1);
});

test('popup opens above at the bottom edge and clamps to a narrow viewport', () => {
  const r = popupRect(
    { left: 350, top: 600, bottom: 640, width: 180 },
    { width: 316, height: 430 },
    { width: 390, height: 700 },
  );
  assert.equal(r.up, true);
  assert.equal(r.top + r.height, 594);
  assert.ok(r.left >= 12 && r.left + r.width <= 378);
  const down = popupRect(
    { left: 16, top: 20, bottom: 60, width: 200 },
    { width: 240, height: 180 },
    { width: 1200, height: 800 },
  );
  assert.equal(down.up, false);
  assert.equal(down.top, 66);
  const calendar = popupRect(
    { left: 400, top: 640, bottom: 680, width: 710 },
    { width: 316, height: 480 },
    { width: 1600, height: 1000 },
  );
  assert.equal(
    calendar.width,
    316,
    'Calendar should not stretch to the whole form width',
  );
  assert.equal(
    calendar.up,
    true,
    'Calendar should fit above instead of clipping its actions below',
  );
  assert.equal(calendar.height, 480);
});

test('colour controls round trip exact RGB without replacing saved colours', () => {
  assert.deepEqual(hexRgb('#f7F4eA'), [247, 244, 234]);
  assert.equal(rgbHex(hexRgb('#f7F4eA')), '#F7F4EA');
  assert.equal(rgbHex([-1, 128.4, 300]), '#0080FF');
  assert.equal(hexRgb('#FFF'), null);
  assert.equal(hexRgb('blue'), null);
});
