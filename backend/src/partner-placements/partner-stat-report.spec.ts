import {
  formatPartnerStatReport,
  partnerPeriodStart,
  type PartnerStatRow,
} from './partner-stat-report';

const now = new Date('2026-10-14T12:00:00Z');
const row = (
  action: PartnerStatRow['action'],
  detailId: string,
  day: string,
  count: number,
): PartnerStatRow => ({
  action,
  detailId,
  day: new Date(day),
  _sum: { count },
});

it('separates card opens, qualified banner impressions, contact IDs, and periods', () => {
  const rows = [
    row('POINT_OPEN', '', '2026-10-14', 2),
    row('CONTACT_CLICK', 'contact-a', '2026-10-14', 3),
    row('CONTACT_CLICK', 'contact-b', '2026-10-14', 4),
    row('CONTACT_CLICK', 'deleted-a', '2026-10-14', 1),
    row('BANNER_IMPRESSION', 'banner-a', '2026-10-14', 5),
    row('BANNER_CLICK', 'banner-a', '2026-10-14', 1),
    row('POINT_OPEN', '', '2026-10-06', 8),
  ];
  const contacts = [
    { id: 'contact-a', label: 'Сайт' },
    { id: 'contact-b', label: 'Сайт' },
  ];
  const seven = formatPartnerStatReport(rows, contacts, '7', now);
  expect(seven).toContain('Открытия карточки: 2');
  expect(seven).toContain('Квалифицированные показы баннера: 5');
  expect(seven).toContain('Контакт 1 — Сайт: 3');
  expect(seven).toContain('Контакт 2 — Сайт: 4');
  expect(seven).toContain('Удалённый контакт 1: 1');
  expect(seven).not.toContain('deleted-a');
  expect(formatPartnerStatReport(rows, contacts, '30', now)).toContain(
    'Открытия карточки: 10',
  );
  expect(formatPartnerStatReport(rows, contacts, 'ALL', now)).toContain(
    'Всего учтённых действий: 24',
  );
  expect(partnerPeriodStart('7', now)?.toISOString()).toBe(
    '2026-10-08T00:00:00.000Z',
  );
});
