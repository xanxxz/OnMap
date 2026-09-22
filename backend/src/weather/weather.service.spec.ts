import { ConfigService } from '@nestjs/config';

import { parseWeatherResponse, WeatherService } from './weather.service';

describe('WeatherService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('normalizes the minimal current weather payload', () => {
    expect(
      parseWeatherResponse({
        now_dt: '2026-09-14T09:00:00.000Z',
        fact: {
          temp: 24,
          condition: 'cloudy',
          icon: 'bkn_d',
        },
      }),
    ).toEqual({
      temperature: 24,
      condition: 'cloudy',
      icon: 'bkn_d',
      updatedAt: '2026-09-14T09:00:00.000Z',
    });
  });

  it('returns null without exposing or requesting with a missing API key', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const service = new WeatherService(
      new ConfigService({ YANDEX_WEATHER_API_KEY: '' }),
    );

    await expect(service.getCurrent('balakovo')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caches a successful response per city', async () => {
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          now_dt: '2026-09-14T09:00:00.000Z',
          fact: { temp: 19, condition: 'clear' },
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;
    const service = new WeatherService(
      new ConfigService({ YANDEX_WEATHER_API_KEY: 'test-key' }),
    );

    await expect(service.getCurrent('balakovo')).resolves.toMatchObject({
      temperature: 19,
      condition: 'clear',
    });
    await service.getCurrent('balakovo');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];

    if (request === undefined) {
      throw new Error('Expected one weather request');
    }

    const [requestUrl, requestInit] = request;
    expect(requestUrl).toBeInstanceOf(URL);
    expect((requestUrl as URL).searchParams.get('lat')).toBe('52.0278');
    expect(requestInit?.headers).toEqual({
      Accept: 'application/json',
      'X-Yandex-Weather-Key': 'test-key',
    });
  });

  it('degrades to null when the provider is unavailable', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as typeof fetch;
    const service = new WeatherService(
      new ConfigService({ YANDEX_WEATHER_API_KEY: 'test-key' }),
    );

    await expect(service.getCurrent('balakovo')).resolves.toBeNull();
  });
});
