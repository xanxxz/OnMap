export const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (value === undefined || value.trim() === '') return [];

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ALLOWED_ORIGINS must contain valid origins');
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS entries must be exact http(s) origins without paths or credentials',
      );
    }
  }

  return [...new Set(origins)];
};

export const isAllowedOrigin = (
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): boolean =>
  requestOrigin === undefined ||
  requestOrigin.length === 0 ||
  allowedOrigins.includes(requestOrigin);
