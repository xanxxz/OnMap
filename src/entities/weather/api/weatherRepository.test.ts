import { httpRequest } from '../../../shared/api/httpClient';

import { weatherRepository } from './weatherRepository';

jest.mock('../../../shared/api/httpClient', () => ({
  httpRequest: jest.fn(),
}));

describe('weatherRepository', () => {
  const requestMock = httpRequest as jest.MockedFunction<typeof httpRequest>;

  beforeEach(() => {
    requestMock.mockReset();
  });

  it('requests weather by city without a mobile API credential', async () => {
    requestMock.mockResolvedValue({
      temperature: 24,
      condition: 'cloudy',
      updatedAt: '2026-09-14T09:00:00.000Z',
    });

    await expect(
      weatherRepository.getCurrent('balakovo'),
    ).resolves.toMatchObject({
      temperature: 24,
    });

    expect(requestMock).toHaveBeenCalledWith('/weather?cityId=balakovo');
    expect(JSON.stringify(requestMock.mock.calls)).not.toContain(
      'YANDEX_WEATHER_API_KEY',
    );
  });

  it('treats an unavailable response as absent weather', async () => {
    requestMock.mockResolvedValue(null);

    await expect(weatherRepository.getCurrent('balakovo')).resolves.toBeNull();
  });
});
