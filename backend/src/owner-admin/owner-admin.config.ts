export const OWNER_ADMIN_TTL_MS = 20 * 60_000;
export const OWNER_ADMIN_ORIGIN = 'http://127.0.0.1:4173';
export const ownerAdminOrigin = (configured?: string): string => {
  const value = configured ?? OWNER_ADMIN_ORIGIN;
  const url = new URL(value);
  if (
    url.hostname !== '127.0.0.1' ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== value ||
    url.username ||
    url.password
  ) {
    throw new Error('OWNER_ADMIN_ORIGIN must be an exact loopback origin');
  }
  return value;
};
export const isOwnerAdminPath = (path: string): boolean =>
  /^\/api\/owner-admin(?:\/|\?|$)/u.test(path);
