import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { getCityConfig } from '../cities/city.registry';

import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  getCurrent(@Query('cityId') cityId: string | undefined) {
    const normalizedCityId = cityId?.trim() ?? '';

    if (
      normalizedCityId.length === 0 ||
      getCityConfig(normalizedCityId) === undefined
    ) {
      throw new BadRequestException('Unsupported cityId');
    }

    return this.weatherService.getCurrent(normalizedCityId);
  }
}
