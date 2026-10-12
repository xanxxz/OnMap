/**
 * Telegram messages are shown to every RoadRadar client as event context.
 * Keep the useful road report while removing obvious contact and link data.
 */
export const sanitizeTelegramSourceText = (
  sourceText: string,
): string | undefined => {
  const sanitized = sourceText
    .replace(
      /\b(?:TELEGRAM_SESSION|TELEGRAM_API_HASH|TELEGRAM_API_ID|API_HASH|API_ID|AUTH_KEY)\s*[:=]\s*\S+/giu,
      '[секрет скрыт]',
    )
    .replace(
      /\[([^\]]+)\]\((?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)[^)]+\)/giu,
      '$1',
    )
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/giu, '[контакт скрыт]')
    .replace(
      /(?:https?:\/\/|www\.)\S+|(?:t\.me|telegram\.me)\/\S+|(?:[a-z0-9-]+\.)+(?:com|ru|org|net|io|me)(?:\/\S*)?/giu,
      '[ссылка скрыта]',
    )
    .replace(/@[a-z0-9_]{3,32}/giu, '[контакт скрыт]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/gu, (candidate) => {
      const digitCount = candidate.replace(/\D/gu, '').length;
      return digitCount >= 10 && digitCount <= 15
        ? '[телефон скрыт]'
        : candidate;
    })
    .replace(
      /(^|[\s,;.!?])(?:меня\s+зовут|зовут|автор|имя|контакт|телефон)\s*[:—-]?\s*[^\n,;.!?]+/giu,
      '$1[личные данные скрыты]',
    )
    .replace(/<\/?[a-z][^>]*>/giu, '')
    .replace(/([*_~`])\1?/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

  const hasUsefulText =
    sanitized
      .replace(
        /\[(?:ссылка скрыта|контакт скрыт|телефон скрыт|личные данные скрыты|секрет скрыт)\]/gu,
        '',
      )
      .replace(/[\s.,;:!?—-]/gu, '').length > 0;

  return hasUsefulText ? sanitized.slice(0, 1_000) : undefined;
};
