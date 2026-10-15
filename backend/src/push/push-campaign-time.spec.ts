import {
  isNewsHour,
  nextRecurringRun,
  parseCampaignSchedule,
  projectCampaignScheduleToZone,
  saratovDayStart,
} from './push-campaign-time';

describe('Europe/Saratov campaign scheduling', () => {
  const now = new Date('2026-10-13T10:00:00.000Z');

  it('accepts a one-time run in Saratov local time', () => {
    const schedule = parseCampaignSchedule('один 2026-10-15 10:30', now);
    expect(schedule?.kind).toBe('ONCE');
    expect(schedule?.firstRunAt.toISOString()).toBe('2026-10-15T06:30:00.000Z');
  });

  it('rejects quiet hours, invalid dates and unbounded repetition', () => {
    expect(parseCampaignSchedule('один 2026-10-15 07:59', now)).toBeNull();
    expect(parseCampaignSchedule('один 2026-02-30 10:30', now)).toBeNull();
    expect(
      parseCampaignSchedule('каждый день 2026-10-15 10:30', now),
    ).toBeNull();
    expect(
      parseCampaignSchedule('каждый день 2026-10-15 10:30 до 2027-02-15', now),
    ).toBeNull();
  });

  it('skips missed recurring runs and stops after the end', () => {
    const end = new Date('2026-10-20T17:59:00.000Z');
    expect(
      nextRecurringRun(
        'DAILY',
        '10:30',
        null,
        new Date('2026-10-15T07:00:00.000Z'),
        end,
      )?.toISOString(),
    ).toBe('2026-10-16T06:30:00.000Z');
    expect(
      nextRecurringRun(
        'DAILY',
        '10:30',
        null,
        new Date('2026-10-20T18:00:00.000Z'),
        end,
      ),
    ).toBeNull();
  });

  it('uses Saratov calendar day for news cap', () => {
    expect(
      saratovDayStart(new Date('2026-10-13T21:00:00.000Z')).toISOString(),
    ).toBe('2026-10-13T20:00:00.000Z');
    expect(isNewsHour(new Date('2026-10-13T17:59:00.000Z'))).toBe(true);
    expect(isNewsHour(new Date('2026-10-13T18:00:00.000Z'))).toBe(false);
  });

  it('projects one local send time to each city instead of one shared UTC instant', () => {
    const schedule = parseCampaignSchedule(
      'каждый день 2026-10-15 10:30 до 2026-10-17',
      now,
    );
    expect(schedule).not.toBeNull();
    const saratov = projectCampaignScheduleToZone(
      schedule!,
      'Europe/Saratov',
      'Europe/Saratov',
      now,
    );
    const moscow = projectCampaignScheduleToZone(
      schedule!,
      'Europe/Saratov',
      'Europe/Moscow',
      now,
    );
    expect(saratov?.nextRunAt.toISOString()).toBe('2026-10-15T06:30:00.000Z');
    expect(moscow?.nextRunAt.toISOString()).toBe('2026-10-15T07:30:00.000Z');
    expect(saratov?.endsAt?.toISOString()).toBe('2026-10-17T17:59:00.000Z');
    expect(moscow?.endsAt?.toISOString()).toBe('2026-10-17T18:59:00.000Z');
  });
});
