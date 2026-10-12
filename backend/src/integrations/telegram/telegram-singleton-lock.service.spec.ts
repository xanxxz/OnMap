jest.mock('pg', () => ({ Client: jest.fn() }));

import { Client } from 'pg';
import type { ConfigService } from '@nestjs/config';
import { TelegramSingletonLockService } from './telegram-singleton-lock.service';

describe('TelegramSingletonLockService', () => {
  let connected: boolean;
  let clientErrorHandler: (() => void) | undefined;
  let client: {
    connect: jest.Mock;
    once: jest.Mock;
    query: jest.Mock;
    end: jest.Mock;
  };
  let service: TelegramSingletonLockService;

  beforeEach(() => {
    connected = true;
    clientErrorHandler = undefined;
    client = {
      connect: jest.fn().mockResolvedValue(undefined),
      once: jest.fn((event: string, handler: () => void) => {
        if (event === 'error') clientErrorHandler = handler;
      }),
      query: jest
        .fn()
        .mockImplementation((query: string) =>
          Promise.resolve(
            query.includes('pg_try_advisory_lock')
              ? { rows: [{ acquired: connected }] }
              : { rows: [{ pg_advisory_unlock: true }] },
          ),
        ),
      end: jest.fn().mockResolvedValue(undefined),
    };
    (Client as unknown as jest.Mock).mockImplementation(() => client);
    service = new TelegramSingletonLockService({
      getOrThrow: () => 'postgres://test-only',
    } as unknown as ConfigService);
  });

  it('keeps the lock connection open until release', async () => {
    expect(await service.tryAcquire('mtproto-runtime')).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      ['809311002'],
    );
    expect(client.end).not.toHaveBeenCalled();

    await service.release('mtproto-runtime');
    expect(client.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1::bigint)',
      ['809311002'],
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('does not acquire or retain a second-instance lock', async () => {
    connected = false;
    expect(await service.tryAcquire('moderation-bot')).toBe(false);
    expect(client.end).toHaveBeenCalledTimes(1);
    await service.release('moderation-bot');
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('fails closed with a safe error when lock storage is unavailable', async () => {
    client.connect.mockRejectedValue(new Error('private database details'));
    await expect(service.tryAcquire('moderation-bot')).rejects.toThrow(
      'TELEGRAM_SINGLETON_LOCK_UNAVAILABLE',
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('notifies the consumer and drops the lock handle if its connection is lost', async () => {
    const onLockLost = jest.fn();
    expect(await service.tryAcquire('mtproto-runtime', onLockLost)).toBe(true);

    clientErrorHandler?.();

    expect(onLockLost).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(client.end).toHaveBeenCalledTimes(1);
    await service.release('mtproto-runtime');
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
