type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export const cityLocalParts = (date: Date, timeZone: string): Parts => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (key: string) =>
    Number(parts.find((part) => part.type === key)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
};

export const cityLocalToUtc = (local: Parts, timeZone: string): Date | null => {
  const nominal = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const candidates = [-86_400_000, 0, 86_400_000].flatMap((shift) => {
    const offset =
      formatter
        .formatToParts(new Date(nominal + shift))
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
    if (offset === 'GMT') return [new Date(nominal)];
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/u.exec(offset);
    if (!match) return [];
    const minutes =
      (match[1] === '+' ? 1 : -1) *
      (Number(match[2]) * 60 + Number(match[3] ?? 0));
    return [new Date(nominal - minutes * 60_000)];
  });
  return (
    candidates
      .filter((date) => {
        const actual = cityLocalParts(date, timeZone);
        return Object.keys(local).every(
          (key) => actual[key as keyof Parts] === local[key as keyof Parts],
        );
      })
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  );
};

export const formatCityTime = (date: Date, timeZone: string): string => {
  const p = cityLocalParts(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)} ${timeZone}`;
};
