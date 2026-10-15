import {
  PUSH_CAMPAIGN_MAX_DURATION_MS,
  PUSH_NEWS_END_HOUR,
  PUSH_NEWS_START_HOUR,
} from './push-policy';
import { cityLocalParts, cityLocalToUtc } from '../cities/city-local-time';

export const PUSH_TIME_ZONE = 'Europe/Saratov';

export type CampaignSchedule = {
  kind: 'NOW' | 'ONCE' | 'DAILY' | 'WEEKLY';
  localTime: string | null;
  weekday: number | null;
  firstRunAt: Date;
  endsAt: Date | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PUSH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PUSH_TIME_ZONE,
  timeZoneName: 'shortOffset',
});

export const saratovParts = (date: Date): DateParts => {
  const parts = formatter.formatToParts(date);
  const number = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: number('hour'),
    minute: number('minute'),
  };
};

const offsetMinutes = (date: Date): number => {
  const value =
    offsetFormatter
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/u.exec(value);
  if (!match) throw new Error('Saratov time zone offset unavailable');
  return (
    (match[1] === '+' ? 1 : -1) *
    (Number(match[2]) * 60 + Number(match[3] ?? 0))
  );
};

export const saratovToUtc = (parts: DateParts): Date | null => {
  const nominal = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const date = new Date(nominal - offsetMinutes(new Date(nominal)) * 60_000);
  const actual = saratovParts(date);
  return Object.keys(parts).every(
    (key) => actual[key as keyof DateParts] === parts[key as keyof DateParts],
  )
    ? date
    : null;
};

export const isNewsHour = (date: Date): boolean => {
  const { hour } = saratovParts(date);
  return hour >= PUSH_NEWS_START_HOUR && hour < PUSH_NEWS_END_HOUR;
};

const localDate = (date: Date): Date => {
  const p = saratovParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
};

export const saratovDayStart = (date: Date): Date => {
  const day = localDate(date);
  const midnight = localCandidate(day, '00:00');
  if (!midnight) throw new Error('Saratov day start unavailable');
  return midnight;
};

const localCandidate = (day: Date, localTime: string): Date | null => {
  const [hour, minute] = localTime.split(':').map(Number);
  return saratovToUtc({
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
    hour,
    minute,
  });
};

export const nextRecurringRun = (
  kind: 'DAILY' | 'WEEKLY',
  localTime: string,
  weekday: number | null,
  after: Date,
  endsAt: Date,
  timeZone = PUSH_TIME_ZONE,
): Date | null => {
  const p = cityLocalParts(after, timeZone);
  const firstDay = new Date(Date.UTC(p.year, p.month - 1, p.day));
  for (let offset = 0; offset <= 91; offset += 1) {
    const day = new Date(firstDay.getTime() + offset * 86_400_000);
    if (kind === 'WEEKLY' && day.getUTCDay() !== weekday) continue;
    const [hour, minute] = localTime.split(':').map(Number);
    const candidate = cityLocalToUtc(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour,
        minute,
      },
      timeZone,
    );
    if (candidate && candidate > after && candidate <= endsAt) return candidate;
  }
  return null;
};

export const isNewsHourInZone = (date: Date, timeZone: string): boolean => {
  const { hour } = cityLocalParts(date, timeZone);
  return hour >= PUSH_NEWS_START_HOUR && hour < PUSH_NEWS_END_HOUR;
};

export const nextNewsWindowInZone = (after: Date, timeZone: string): Date => {
  const p = cityLocalParts(after, timeZone);
  for (let offset = 0; offset < 3; offset += 1) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + offset));
    const candidate = cityLocalToUtc(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour: PUSH_NEWS_START_HOUR,
        minute: 0,
      },
      timeZone,
    );
    if (candidate && candidate > after) return candidate;
  }
  throw new Error('Next local news window unavailable');
};

export const projectCampaignScheduleToZone = (
  schedule: CampaignSchedule,
  referenceZone: string,
  targetZone: string,
  now: Date,
): { nextRunAt: Date; endsAt: Date | null } | null => {
  if (schedule.kind === 'NOW') {
    return {
      nextRunAt: isNewsHourInZone(now, targetZone)
        ? now
        : nextNewsWindowInZone(now, targetZone),
      endsAt: null,
    };
  }
  const firstLocal = cityLocalParts(schedule.firstRunAt, referenceZone);
  const first = cityLocalToUtc(firstLocal, targetZone);
  if (!first) return null;
  const endLocal = schedule.endsAt
    ? cityLocalParts(schedule.endsAt, referenceZone)
    : null;
  const endsAt = endLocal ? cityLocalToUtc(endLocal, targetZone) : null;
  if (endLocal && !endsAt) return null;
  if (schedule.kind === 'ONCE')
    return first > now ? { nextRunAt: first, endsAt: null } : null;
  if (!schedule.localTime || !endsAt) return null;
  const nextRunAt =
    first > now
      ? first
      : nextRecurringRun(
          schedule.kind,
          schedule.localTime,
          schedule.weekday,
          now,
          endsAt,
          targetZone,
        );
  return nextRunAt ? { nextRunAt, endsAt } : null;
};

export const nextNewsWindow = (after: Date): Date => {
  const start = localDate(after);
  const today = localCandidate(start, '08:00');
  if (today && after < today) return today;
  const tomorrow = new Date(start.getTime() + 86_400_000);
  const next = localCandidate(tomorrow, '08:00');
  if (!next) throw new Error('Next Saratov news window unavailable');
  return next;
};

export const parseCampaignSchedule = (
  raw: string,
  now: Date,
  timeZone = PUSH_TIME_ZONE,
): CampaignSchedule | null => {
  const input = raw.trim();
  if (input === 'сейчас' || input.toLowerCase() === 'now') {
    return {
      kind: 'NOW',
      localTime: null,
      weekday: null,
      firstRunAt: isNewsHourInZone(now, timeZone)
        ? now
        : nextNewsWindowInZone(now, timeZone),
      endsAt: null,
    };
  }
  const match =
    /^(один|каждый день|каждую неделю)\s+(?:(пн|вт|ср|чт|пт|сб|вс)\s+)?(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?:\s+до\s+(\d{4}-\d{2}-\d{2}))?$/iu.exec(
      input,
    );
  if (!match) return null;
  const kind =
    match[1] === 'один'
      ? 'ONCE'
      : match[1] === 'каждый день'
        ? 'DAILY'
        : 'WEEKLY';
  const weekdayLabels = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const weekday = match[2]
    ? weekdayLabels.indexOf(match[2].toLowerCase())
    : null;
  if ((kind === 'WEEKLY') !== (weekday !== null)) return null;
  const [year, month, day] = match[3].split('-').map(Number);
  const [hour, minute] = match[4].split(':').map(Number);
  if (hour < PUSH_NEWS_START_HOUR || hour >= PUSH_NEWS_END_HOUR || minute > 59)
    return null;
  const first = cityLocalToUtc({ year, month, day, hour, minute }, timeZone);
  if (
    !first ||
    first <= now ||
    first.getTime() - now.getTime() > PUSH_CAMPAIGN_MAX_DURATION_MS
  )
    return null;
  if (kind === 'ONCE' && match[5]) return null;
  if (kind !== 'ONCE' && !match[5]) return null;
  const endsAt = match[5]
    ? (() => {
        const [endYear, endMonth, endDay] = match[5].split('-').map(Number);
        return cityLocalToUtc(
          {
            year: endYear,
            month: endMonth,
            day: endDay,
            hour: 21,
            minute: 59,
          },
          timeZone,
        );
      })()
    : null;
  if (
    endsAt &&
    (endsAt < first ||
      endsAt.getTime() - now.getTime() > PUSH_CAMPAIGN_MAX_DURATION_MS)
  )
    return null;
  const firstDay = cityLocalParts(first, timeZone);
  if (
    kind === 'WEEKLY' &&
    new Date(
      Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day),
    ).getUTCDay() !== weekday
  )
    return null;
  return {
    kind,
    localTime: kind === 'ONCE' ? null : match[4],
    weekday,
    firstRunAt: first,
    endsAt,
  };
};

export const formatSaratovTime = (date: Date): string => {
  const p = saratovParts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} ${PUSH_TIME_ZONE}`;
};
