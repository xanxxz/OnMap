import sharp from 'sharp';

export const PARTNER_IMAGE_MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const PARTNER_IMAGE_CANVAS_SIZE = 256;
const CONTENT_SIZE = 208; // 24 transparent pixels on every side.
const MAX_SOURCE_PIXELS = 16_000_000;

export class PartnerImageError extends Error {
  constructor(readonly reason: 'SIZE' | 'FORMAT' | 'CORRUPT') {
    super(`PARTNER_IMAGE_${reason}`);
  }
}

export const sniffPartnerRasterMime = (
  bytes: Buffer,
): 'image/png' | 'image/jpeg' | 'image/webp' | null => {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
};

export const normalizePartnerImage = async (bytes: Buffer): Promise<Buffer> => {
  if (bytes.length === 0 || bytes.length > PARTNER_IMAGE_MAX_SOURCE_BYTES)
    throw new PartnerImageError('SIZE');
  const mime = sniffPartnerRasterMime(bytes);
  if (!mime) throw new PartnerImageError('FORMAT');
  try {
    const options = {
      limitInputPixels: MAX_SOURCE_PIXELS,
      failOn: 'error' as const,
      animated: false,
    };
    const metadata = await sharp(bytes, options).metadata();
    if (
      metadata.format !== mime.slice('image/'.length) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_SOURCE_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new PartnerImageError('FORMAT');
    }
    const output = await sharp(bytes, options)
      .rotate()
      .resize(CONTENT_SIZE, CONTENT_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 24,
        bottom: 24,
        left: 24,
        right: 24,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const decoded = await sharp(output).metadata();
    if (
      decoded.width !== PARTNER_IMAGE_CANVAS_SIZE ||
      decoded.height !== PARTNER_IMAGE_CANVAS_SIZE ||
      decoded.format !== 'png'
    )
      throw new PartnerImageError('CORRUPT');
    return output;
  } catch (error) {
    if (error instanceof PartnerImageError) throw error;
    throw new PartnerImageError('CORRUPT');
  }
};
