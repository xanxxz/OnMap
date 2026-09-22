import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { TOMTOM_REQUEST_TIMEOUT_MS } from './tomtom.constants';
import { TomTomClient } from './tomtom.client';

describe('TomTomClient', () => {
  let configService: {
    get: jest.Mock;
  };
  let client: TomTomClient;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('test-only-key'),
    };
    client = new TomTomClient(configService as unknown as ConfigService);

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not call fetch when the provider is disabled', async () => {
    configService.get.mockReturnValue(undefined);
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      client.requestJson('Traffic', 'https://api.tomtom.com/test', {}),
    ).rejects.toMatchObject({
      code: 'DISABLED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns a controlled HTTP error without exposing the response body', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('sensitive upstream body', { status: 503 }),
      );

    await expect(
      client.requestJson('Search', 'https://api.tomtom.com/test', {}),
    ).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      httpStatus: 503,
      message: 'TomTom Search request failed',
    });
  });

  it('returns a controlled invalid response error for malformed JSON', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('not-json', { status: 200 }));

    await expect(
      client.requestJson('Search', 'https://api.tomtom.com/test', {}),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('aborts a request and reports a controlled timeout', async () => {
    jest.useFakeTimers();

    jest.spyOn(global, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });
    });

    const request = client.requestJson(
      'Traffic',
      'https://api.tomtom.com/test',
      {},
    );
    const expectation = expect(request).rejects.toMatchObject({
      code: 'TIMEOUT',
    });

    await jest.advanceTimersByTimeAsync(TOMTOM_REQUEST_TIMEOUT_MS);
    await expectation;
  });
});
