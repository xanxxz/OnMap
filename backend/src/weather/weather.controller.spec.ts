import { BadRequestException } from '@nestjs/common';

import { WeatherController } from './weather.controller';
import type { WeatherService } from './weather.service';

describe('WeatherController', () => {
  it('uses the selected city from the backend city registry', async () => {
    const getCurrent = jest.fn().mockResolvedValue(null);
    const weatherService = {
      getCurrent,
    } as unknown as WeatherService;
    const controller = new WeatherController(weatherService);

    await controller.getCurrent('balakovo');

    expect(getCurrent).toHaveBeenCalledWith('balakovo');
  });

  it('rejects unsupported cities without calling the provider', () => {
    const getCurrent = jest.fn();
    const weatherService = {
      getCurrent,
    } as unknown as WeatherService;
    const controller = new WeatherController(weatherService);

    expect(() => controller.getCurrent('unknown')).toThrow(BadRequestException);
    expect(getCurrent).not.toHaveBeenCalled();
  });
});
