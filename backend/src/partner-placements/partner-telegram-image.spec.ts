import {
  downloadPartnerTelegramImage,
  telegramImageReference,
} from './partner-telegram-image';

describe('Telegram partner image transport', () => {
  it('takes the largest photo or a document without trusting its filename', () => {
    expect(
      telegramImageReference({
        photo: [
          { file_id: 'small', width: 100, height: 100 },
          { file_id: 'large', width: 500, height: 500, file_size: 123 },
        ],
      }),
    ).toEqual({ fileId: 'large', advertisedSize: 123 });
    expect(
      telegramImageReference({
        document: { file_id: 'document', file_name: '../../bad.svg' },
      }),
    ).toEqual({ fileId: 'document' });
  });

  it('rejects oversized files and unsafe Telegram paths before download', async () => {
    const getFile = jest.fn().mockResolvedValue({ file_path: '../secret.png' });
    const fetchFn = jest.fn();
    await expect(
      downloadPartnerTelegramImage(
        { fileId: 'x', advertisedSize: 5_000_000 },
        'test',
        getFile,
        fetchFn as never,
      ),
    ).rejects.toMatchObject({ reason: 'SIZE' });
    expect(getFile).not.toHaveBeenCalled();
    await expect(
      downloadPartnerTelegramImage(
        { fileId: 'x' },
        'test',
        getFile,
        fetchFn as never,
      ),
    ).rejects.toThrow('PARTNER_IMAGE_DOWNLOAD_FAILED');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('bounds the response even when Telegram omits its size', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array(4 * 1024 * 1024 + 1), { status: 200 }),
      );
    await expect(
      downloadPartnerTelegramImage(
        { fileId: 'x' },
        'test',
        () => Promise.resolve({ file_path: 'photos/a.png' }),
        fetchFn as never,
      ),
    ).rejects.toMatchObject({ reason: 'SIZE' });
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/photos/a.png'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });
});
