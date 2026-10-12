import sharp from 'sharp';
import {
  normalizePartnerImage,
  PartnerImageError,
  PARTNER_IMAGE_MAX_SOURCE_BYTES,
} from './partner-image';

describe('partner marker image normalization', () => {
  it('keeps wide and tall images proportional on a transparent square with safe margins', async () => {
    for (const [width, height] of [
      [400, 100],
      [100, 400],
    ]) {
      const source = await sharp({
        create: { width, height, channels: 4, background: '#ff0000ff' },
      })
        .png()
        .toBuffer();
      const result = await normalizePartnerImage(source);
      const meta = await sharp(result).metadata();
      expect(meta).toMatchObject({
        format: 'png',
        width: 256,
        height: 256,
        hasAlpha: true,
      });
      const { data, info } = await sharp(result)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alpha = (x: number, y: number) =>
        data[(y * info.width + x) * info.channels + 3];
      expect(alpha(0, 0)).toBe(0);
      expect(alpha(128, 128)).toBe(255);
      expect(alpha(128, 12)).toBe(0);
      expect(alpha(12, 128)).toBe(0);
      if (width > height) expect(alpha(128, 90)).toBe(0);
      else expect(alpha(90, 128)).toBe(0);
    }
  });

  it('accepts JPEG and WebP based on actual bytes', async () => {
    const image = sharp({
      create: { width: 20, height: 30, channels: 3, background: '#336699' },
    });
    for (const bytes of [
      await image.clone().jpeg().toBuffer(),
      await image.clone().webp().toBuffer(),
    ])
      expect(
        (await sharp(await normalizePartnerImage(bytes)).metadata()).format,
      ).toBe('png');
  });

  it('rejects SVG, corrupt raster, oversized input and pixel bombs', async () => {
    await expect(
      normalizePartnerImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      ),
    ).rejects.toMatchObject({
      reason: 'FORMAT',
    } satisfies Partial<PartnerImageError>);
    await expect(
      normalizePartnerImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])),
    ).rejects.toMatchObject({ reason: 'CORRUPT' });
    await expect(
      normalizePartnerImage(Buffer.alloc(PARTNER_IMAGE_MAX_SOURCE_BYTES + 1)),
    ).rejects.toMatchObject({ reason: 'SIZE' });
    const huge = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    await expect(normalizePartnerImage(huge)).rejects.toBeInstanceOf(
      PartnerImageError,
    );
  });
});
