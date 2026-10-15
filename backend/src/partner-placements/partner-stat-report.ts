type StatAction =
  'POINT_OPEN' | 'CONTACT_CLICK' | 'BANNER_IMPRESSION' | 'BANNER_CLICK';

export type PartnerStatRow = {
  action: StatAction;
  detailId: string;
  day: Date;
  _sum: { count: number | null };
};

export type PartnerStatPeriod = '7' | '30' | 'ALL';

export const partnerPeriodStart = (
  period: PartnerStatPeriod,
  now: Date,
): Date | null => {
  if (period === 'ALL') return null;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - Number(period) + 1,
    ),
  );
};

export const formatPartnerStatReport = (
  rows: readonly PartnerStatRow[],
  contacts: readonly { id: string; label: string }[],
  period: PartnerStatPeriod,
  now: Date,
): string => {
  const since = partnerPeriodStart(period, now);
  const selected = rows.filter((row) => !since || row.day >= since);
  const count = (action: StatAction) =>
    selected.reduce(
      (sum, row) => sum + (row.action === action ? (row._sum.count ?? 0) : 0),
      0,
    );
  const contactCounts = new Map<string, number>();
  for (const row of selected) {
    if (row.action === 'CONTACT_CLICK') {
      contactCounts.set(
        row.detailId,
        (contactCounts.get(row.detailId) ?? 0) + (row._sum.count ?? 0),
      );
    }
  }
  const known = new Map(
    contacts.map((contact, index) => [
      contact.id,
      `Контакт ${index + 1} — ${contact.label}`,
    ]),
  );
  const deletedIds = [...contactCounts.keys()]
    .filter((id) => !known.has(id))
    .sort();
  const deletedNames = new Map(
    deletedIds.map((id, index) => [id, `Удалённый контакт ${index + 1}`]),
  );
  const contactLines = [...contactCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, value]) => `• ${known.get(id) ?? deletedNames.get(id)}: ${value}`,
    );
  const opens = count('POINT_OPEN');
  const impressions = count('BANNER_IMPRESSION');
  const contactClicks = count('CONTACT_CLICK');
  const bannerClicks = count('BANNER_CLICK');
  return [
    `Открытия карточки: ${opens}`,
    `Квалифицированные показы баннера: ${impressions}`,
    `Нажатия по контактам: ${contactClicks}`,
    ...contactLines,
    `Нажатия на баннер: ${bannerClicks}`,
    `Всего учтённых действий: ${opens + impressions + contactClicks + bannerClicks}`,
  ].join('\n');
};
