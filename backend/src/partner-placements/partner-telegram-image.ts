import {
  PartnerImageError,
  PARTNER_IMAGE_MAX_SOURCE_BYTES,
} from './partner-image';

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike | null =>
  value && typeof value === 'object' ? (value as RecordLike) : null;

export interface TelegramImageReference {
  fileId: string;
  advertisedSize?: number;
}

export const telegramImageReference = (
  message: unknown,
): TelegramImageReference | null => {
  const item = record(message);
  const photos = Array.isArray(item?.photo) ? item.photo : [];
  const photo = photos
    .map(record)
    .filter(
      (entry): entry is RecordLike =>
        !!entry && typeof entry.file_id === 'string',
    )
    .sort(
      (a, b) =>
        Number(b.width ?? 0) * Number(b.height ?? 0) -
        Number(a.width ?? 0) * Number(a.height ?? 0),
    )[0];
  const source = photo ?? record(item?.document);
  if (!source || typeof source.file_id !== 'string' || !source.file_id)
    return null;
  return {
    fileId: source.file_id,
    ...(typeof source.file_size === 'number'
      ? { advertisedSize: source.file_size }
      : {}),
  };
};

const safeFilePath = (path: unknown): path is string =>
  typeof path === 'string' &&
  path.length <= 240 &&
  path.split('/').length >= 2 &&
  path
    .split('/')
    .every(
      (part) =>
        part !== '.' &&
        part !== '..' &&
        /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u.test(part),
    );

export class PartnerImageDownloadError extends Error {
  constructor() {
    super('PARTNER_IMAGE_DOWNLOAD_FAILED');
  }
}

export const downloadPartnerTelegramImage = async (
  reference: TelegramImageReference,
  token: string,
  getFile: (
    fileId: string,
  ) => Promise<{ file_path?: unknown; file_size?: unknown }>,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<Buffer> => {
  if (
    reference.advertisedSize !== undefined &&
    reference.advertisedSize > PARTNER_IMAGE_MAX_SOURCE_BYTES
  )
    throw new PartnerImageError('SIZE');
  const file = await getFile(reference.fileId);
  if (!safeFilePath(file.file_path)) throw new PartnerImageDownloadError();
  if (
    typeof file.file_size === 'number' &&
    file.file_size > PARTNER_IMAGE_MAX_SOURCE_BYTES
  )
    throw new PartnerImageError('SIZE');
  let response: Response;
  try {
    response = await fetchFn(
      `https://api.telegram.org/file/bot${token}/${file.file_path}`,
      {
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      },
    );
  } catch {
    throw new PartnerImageDownloadError();
  }
  if (!response.ok || !response.body) throw new PartnerImageDownloadError();
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > PARTNER_IMAGE_MAX_SOURCE_BYTES)
        throw new PartnerImageError('SIZE');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof PartnerImageError) throw error;
    throw new PartnerImageDownloadError();
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
};
