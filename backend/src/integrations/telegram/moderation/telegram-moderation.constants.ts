export const TELEGRAM_MODERATION_CONFIG = {
  tokenEnv: 'TELEGRAM_MODERATION_BOT_TOKEN',
  chatIdEnv: 'TELEGRAM_MODERATION_CHAT_ID',
  restrictionHoursEnv: 'TELEGRAM_MODERATION_RESTRICTION_HOURS',
  defaultRestrictionHours: [24, 168, 720] as const,
  pollingTimeoutSeconds: 20,
  pollingTimeoutMs: 25_000,
  outboxPollIntervalMs: 5_000,
  requestTimeoutMs: 8_000,
  outboxRetryBaseMs: 5_000,
  outboxRetryMaxMs: 15 * 60_000,
} as const;

export const parseRestrictionHours = (raw: string | undefined): number[] => {
  if (!raw) return [...TELEGRAM_MODERATION_CONFIG.defaultRestrictionHours];
  const values = [
    ...new Set(raw.split(',').map((value) => Number(value.trim()))),
  ];
  if (
    values.length !== 3 ||
    values.some(
      (value) => !Number.isInteger(value) || value <= 0 || value > 720,
    )
  ) {
    return [...TELEGRAM_MODERATION_CONFIG.defaultRestrictionHours];
  }
  return values.sort((left, right) => left - right);
};

export type ModerationCallbackAction =
  | { kind: 'RESTORE'; eventId: string }
  | { kind: 'CHOOSE_RESTRICTION'; eventId: string }
  | { kind: 'RESTRICT'; eventId: string; hours: number };

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export const parseModerationCallback = (
  data: string,
  restrictionHours: readonly number[],
): ModerationCallbackAction | null => {
  let match = new RegExp(`^restore:(${UUID})$`, 'iu').exec(data);
  if (match?.[1]) return { kind: 'RESTORE', eventId: match[1] };

  match = new RegExp(`^restrict:(${UUID})$`, 'iu').exec(data);
  if (match?.[1]) return { kind: 'CHOOSE_RESTRICTION', eventId: match[1] };

  match = new RegExp(`^ban:(${UUID}):(\\d+)$`, 'iu').exec(data);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[2]);
  return restrictionHours.includes(hours)
    ? { kind: 'RESTRICT', eventId: match[1], hours }
    : null;
};
