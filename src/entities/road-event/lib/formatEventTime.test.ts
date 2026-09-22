import {formatEventTime} from './formatEventTime';

describe('formatEventTime', () => {
  it('formats an event timestamp as local HH:mm without a date or seconds', () => {
    const timestamp = '2026-09-21T18:42:30.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(timestamp));

    const result = formatEventTime(timestamp);

    expect(result).toBe(expected);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).not.toContain('2026');
    expect(result).not.toContain('21.09');
  });

  it('returns null for an invalid timestamp', () => {
    expect(formatEventTime('not-a-date')).toBeNull();
  });
});
