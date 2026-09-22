import { httpRequest } from '../../../shared/api/httpClient';

export interface CurrentWeather {
  temperature: number;
  condition: string;
  icon?: string;
  updatedAt: string;
}

const isCurrentWeather = (value: unknown): value is CurrentWeather => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CurrentWeather>;

  return (
    typeof candidate.temperature === 'number' &&
    Number.isFinite(candidate.temperature) &&
    typeof candidate.condition === 'string' &&
    candidate.condition.length > 0 &&
    typeof candidate.updatedAt === 'string'
  );
};

export const weatherRepository = {
  async getCurrent(cityId: string): Promise<CurrentWeather | null> {
    const result = await httpRequest<unknown>(
      `/weather?cityId=${encodeURIComponent(cityId)}`,
    );

    return isCurrentWeather(result) ? result : null;
  },
};
